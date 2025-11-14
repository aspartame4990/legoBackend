package group15.legobackend.undercover.service;

import group15.legobackend.undercover.dto.CreateGameRequest;
import group15.legobackend.undercover.dto.HostGameView;
import group15.legobackend.undercover.dto.HostParticipantView;
import group15.legobackend.undercover.dto.JoinGameRequest;
import group15.legobackend.undercover.dto.JoinGameResponse;
import group15.legobackend.undercover.dto.ParticipantListItem;
import group15.legobackend.undercover.dto.ParticipantView;
import group15.legobackend.undercover.dto.VoteRequest;
import group15.legobackend.undercover.dto.VoteSummaryItem;
import group15.legobackend.undercover.exception.InvalidGameStateException;
import group15.legobackend.undercover.exception.ParticipantNotFoundException;
import group15.legobackend.undercover.exception.ParticipantTokenNotFoundException;
import group15.legobackend.undercover.mqtt.Esp32Notifier;
import group15.legobackend.undercover.model.GameStatus;
import group15.legobackend.undercover.model.Participant;
import group15.legobackend.undercover.model.Team;
import group15.legobackend.undercover.model.UndercoverGame;
import group15.legobackend.undercover.model.WordGroup;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
public class UndercoverGameService {

    private static final Logger log = LoggerFactory.getLogger(UndercoverGameService.class);
    private static final int MIN_PLAYERS = 3;
    private static final Duration BUILD_DURATION = Duration.ofSeconds(150);
    private static final Duration WARNING_WINDOW = Duration.ofSeconds(30);

    private final Esp32Notifier esp32Notifier;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Participant> participantsByToken = new ConcurrentHashMap<>();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);

    private volatile UndercoverGame currentGame;
    private ScheduledFuture<?> warningTask;
    private ScheduledFuture<?> votingTask;

    public UndercoverGameService(Esp32Notifier esp32Notifier) {
        this.esp32Notifier = esp32Notifier;
    }

    @PreDestroy
    public void shutdown() {
        scheduler.shutdownNow();
    }

    public HostGameView createGame(CreateGameRequest request) {
        String civilianWord = requireText(request.civilianWord(), "civilianWord");
        String undercoverWord = requireText(request.undercoverWord(), "undercoverWord");
        UndercoverGame game = new UndercoverGame(civilianWord, undercoverWord);
        synchronized (this) {
            cancelCountdownTasks();
            participantsByToken.clear();
            currentGame = game;
        }
        return mapToHostView(game);
    }

    public HostGameView getHostGame() {
        UndercoverGame game = requireGame();
        synchronized (game) {
            return mapToHostView(game);
        }
    }

    public JoinGameResponse joinGame(JoinGameRequest request) {
        UndercoverGame game = requireGame();
        synchronized (game) {
            ensureStatus(game, Set.of(GameStatus.WAITING_FOR_PLAYERS), "房主尚未开始游戏");
            String playerName = requireText(request.name(), "name");
            boolean duplicateName = game.getParticipants().values().stream()
                    .anyMatch(participant -> participant.getName().equalsIgnoreCase(playerName));
            if (duplicateName) {
                throw new InvalidGameStateException("昵称已被占用，请换一个");
            }
            String participantId = nextParticipantId(game);
            String token = nextParticipantToken();
            Participant participant = new Participant(participantId, token, playerName);
            game.addParticipant(participant);
            participantsByToken.put(token, participant);
            return new JoinGameResponse(participantId, token);
        }
    }

    public ParticipantView getParticipantView(String token) {
        Participant participant = getParticipantByToken(token);
        UndercoverGame game = requireGame();
        synchronized (game) {
            return mapToParticipantView(game, participant);
        }
    }

    public void startGame() {
        UndercoverGame game = requireGame();
        synchronized (game) {
            ensureStatus(game, Set.of(GameStatus.WAITING_FOR_PLAYERS), "游戏已经开始");
            if (game.getParticipants().size() < MIN_PLAYERS) {
                throw new InvalidGameStateException("至少需要 %d 位玩家才能开始游戏".formatted(MIN_PLAYERS));
            }
            List<Participant> participants = new ArrayList<>(game.getParticipants().values());
            Participant undercover = participants.get(random.nextInt(participants.size()));
            game.setUndercoverParticipantId(undercover.getId());
            for (Participant participant : participants) {
                boolean isUndercover = participant.getId().equals(undercover.getId());
                participant.setUndercover(isUndercover);
                participant.setWord(isUndercover ? game.getUndercoverWord() : game.getCivilianWord());
                participant.setHasVoted(false);
                participant.setWordGroup(isUndercover ? WordGroup.WORD_TWO : WordGroup.WORD_ONE);
            }
            game.clearVotes();
            game.setStatus(GameStatus.IN_PROGRESS);
            Instant now = Instant.now();
            game.setStartedAt(now);
            game.setVotingStartedAt(null);
            game.setFinishedAt(null);
            game.setWarningTriggered(false);
            game.setWinningTeam(null);
            game.setCountdownEndsAt(now.plus(BUILD_DURATION));
            scheduleCountdownTasks(game);
            participants.forEach(esp32Notifier::notifyWordAssignment);
        }
    }

    public void recordVote(VoteRequest request) {
        if (request == null || !StringUtils.hasText(request.voterToken())
                || !StringUtils.hasText(request.targetParticipantId())) {
            throw new IllegalArgumentException("投票请求不完整");
        }
        Participant voter = getParticipantByToken(request.voterToken());
        UndercoverGame game = requireGame();
        synchronized (game) {
            ensureStatus(game, Set.of(GameStatus.VOTING), "当前阶段不允许投票");
            if (voter.hasVoted()) {
                throw new InvalidGameStateException("你已经投过票了");
            }
            Participant target = game.getParticipant(request.targetParticipantId());
            if (target == null) {
                throw new ParticipantNotFoundException(request.targetParticipantId());
            }
            if (target.getId().equals(voter.getId())) {
                throw new InvalidGameStateException("不能投给自己");
            }
            game.getVotes().put(voter.getId(), target.getId());
            voter.setHasVoted(true);
            maybeAutoFinish(game);
        }
    }

    private void scheduleCountdownTasks(UndercoverGame game) {
        cancelCountdownTasks();
        if (game.getCountdownEndsAt() == null) {
            return;
        }
        long millisUntilVoting = Math.max(0, Duration.between(Instant.now(), game.getCountdownEndsAt()).toMillis());
        long warningDelay = Math.max(0, millisUntilVoting - WARNING_WINDOW.toMillis());
        warningTask = scheduler.schedule(this::triggerWarning, warningDelay, TimeUnit.MILLISECONDS);
        votingTask = scheduler.schedule(this::triggerVoting, millisUntilVoting, TimeUnit.MILLISECONDS);
    }

    private void triggerWarning() {
        UndercoverGame game = currentGame;
        if (game == null) {
            return;
        }
        synchronized (game) {
            if (game.getStatus() != GameStatus.IN_PROGRESS || game.isWarningTriggered()) {
                return;
            }
            game.setWarningTriggered(true);
            long secondsRemaining = secondsUntilVoting(game);
            esp32Notifier.notifyCountdownWarning(secondsRemaining);
        }
    }

    private void triggerVoting() {
        UndercoverGame game = currentGame;
        if (game == null) {
            return;
        }
        synchronized (game) {
            try {
                startVotingInternal(game);
            } catch (Exception ex) {
                log.warn("Auto start voting failed", ex);
            }
        }
    }

    private void startVotingInternal(UndercoverGame game) {
        if (game.getStatus() != GameStatus.IN_PROGRESS) {
            return;
        }
        cancelCountdownTasks();
        game.setStatus(GameStatus.VOTING);
        game.setVotingStartedAt(Instant.now());
        game.clearVotes();
        game.getParticipants().values().forEach(participant -> participant.setHasVoted(false));
        esp32Notifier.notifyVotingStarted();
    }

    private void maybeAutoFinish(UndercoverGame game) {
        if (game.getStatus() != GameStatus.VOTING) {
            return;
        }
        boolean allVoted = game.getParticipants().values().stream()
                .allMatch(Participant::hasVoted);
        if (allVoted) {
            completeGame(game);
        }
    }

    private void completeGame(UndercoverGame game) {
        if (game.getStatus() == GameStatus.FINISHED) {
            return;
        }
        game.setStatus(GameStatus.FINISHED);
        game.setFinishedAt(Instant.now());
        Team winner = determineWinner(game);
        game.setWinningTeam(winner);
        esp32Notifier.notifyGameResult(game.getParticipants().values(), winner);
    }

    private void cancelCountdownTasks() {
        if (warningTask != null) {
            warningTask.cancel(false);
            warningTask = null;
        }
        if (votingTask != null) {
            votingTask.cancel(false);
            votingTask = null;
        }
    }

    private HostGameView mapToHostView(UndercoverGame game) {
        List<HostParticipantView> participants = game.getParticipants().values().stream()
                .map(p -> new HostParticipantView(p.getId(), p.getName(), p.isUndercover(), p.getWord(), p.hasVoted()))
                .toList();
        List<VoteSummaryItem> voteSummary = buildVoteSummary(game);
        boolean countdownActive = game.getStatus() == GameStatus.IN_PROGRESS && game.getCountdownEndsAt() != null;
        long secondsToVoting = countdownActive ? secondsUntilVoting(game) : 0;
        return new HostGameView(
                game.getCivilianWord(),
                game.getUndercoverWord(),
                game.getStatus(),
                countdownActive,
                secondsToVoting,
                game.getParticipants().size(),
                participants,
                game.getUndercoverParticipantId(),
                voteSummary
        );
    }

    private ParticipantView mapToParticipantView(UndercoverGame game, Participant participant) {
        List<ParticipantListItem> others = game.getParticipants().values().stream()
                .sorted(Comparator.comparing(Participant::getName, String.CASE_INSENSITIVE_ORDER))
                .map(p -> new ParticipantListItem(p.getId(), p.getName()))
                .toList();
        boolean votingAllowed = game.getStatus() == GameStatus.VOTING && participant.canVote();
        List<VoteSummaryItem> voteSummary = buildVoteSummary(game);
        boolean countdownActive = game.getStatus() == GameStatus.IN_PROGRESS && game.getCountdownEndsAt() != null;
        long secondsToVoting = countdownActive ? secondsUntilVoting(game) : 0;
        return new ParticipantView(
                participant.getId(),
                participant.getName(),
                game.getStatus(),
                participant.getWord(),
                game.getCivilianWord(),
                game.getUndercoverWord(),
                countdownActive,
                secondsToVoting,
                votingAllowed,
                participant.hasVoted(),
                others,
                voteSummary
        );
    }

    private List<VoteSummaryItem> buildVoteSummary(UndercoverGame game) {
        Map<String, Long> counts = voteTallies(game);
        return game.getParticipants().values().stream()
                .map(p -> new VoteSummaryItem(p.getId(), p.getName(), counts.getOrDefault(p.getId(), 0L)))
                .toList();
    }

    private Map<String, Long> voteTallies(UndercoverGame game) {
        Collection<String> voteTargets = game.getVotes().values();
        return voteTargets.stream()
                .collect(Collectors.groupingBy(target -> target, Collectors.counting()));
    }

    private long secondsUntilVoting(UndercoverGame game) {
        if (game.getCountdownEndsAt() == null) {
            return 0;
        }
        long seconds = Duration.between(Instant.now(), game.getCountdownEndsAt()).getSeconds();
        return Math.max(0, seconds);
    }

    private Team determineWinner(UndercoverGame game) {
        Map<String, Long> tallies = voteTallies(game);
        if (tallies.isEmpty() || game.getUndercoverParticipantId() == null) {
            return Team.UNDERCOVER;
        }
        Map.Entry<String, Long> top = tallies.entrySet().stream()
                .max(Map.Entry.<String, Long>comparingByValue()
                        .thenComparing(Map.Entry::getKey))
                .orElse(null);
        if (top == null) {
            return Team.UNDERCOVER;
        }
        long topVotes = top.getValue();
        long numberWithTop = tallies.values().stream()
                .filter(count -> count.equals(topVotes))
                .count();
        if (numberWithTop > 1) {
            return Team.UNDERCOVER;
        }
        if (top.getKey().equals(game.getUndercoverParticipantId())) {
            return Team.CIVILIANS;
        }
        return Team.UNDERCOVER;
    }

    private UndercoverGame requireGame() {
        UndercoverGame game = currentGame;
        if (game == null) {
            throw new InvalidGameStateException("当前没有进行中的游戏，请房主先创建");
        }
        return game;
    }

    private Participant getParticipantByToken(String token) {
        Participant participant = participantsByToken.get(token);
        if (participant == null) {
            throw new ParticipantTokenNotFoundException();
        }
        return participant;
    }

    private void ensureStatus(UndercoverGame game, Set<GameStatus> expected, String message) {
        if (!expected.contains(game.getStatus())) {
            throw new InvalidGameStateException(message);
        }
    }

    private String requireText(String value, String fieldName) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException("%s 不能为空".formatted(fieldName));
        }
        return value.trim();
    }

    private String nextParticipantId(UndercoverGame game) {
        String code;
        do {
            code = randomString(8);
        } while (game.getParticipants().containsKey(code));
        return code;
    }

    private String nextParticipantToken() {
        String token;
        do {
            token = randomString(28);
        } while (participantsByToken.containsKey(token));
        return token;
    }

    private String randomString(int length) {
        final String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        return random.ints(length, 0, alphabet.length())
                .mapToObj(alphabet::charAt)
                .map(Object::toString)
                .collect(Collectors.joining());
    }
}
