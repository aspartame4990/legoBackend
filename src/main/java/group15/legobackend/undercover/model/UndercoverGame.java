package group15.legobackend.undercover.model;

import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

public class UndercoverGame {

    private String civilianWord;
    private String undercoverWord;
    private GameStatus status = GameStatus.WAITING_FOR_PLAYERS;
    private final Map<String, Participant> participants = new LinkedHashMap<>();
    private final Map<String, String> votes = new LinkedHashMap<>();
    private String undercoverParticipantId;
    private final Instant createdAt = Instant.now();
    private Instant startedAt;
    private Instant votingStartedAt;
    private Instant finishedAt;
    private Instant countdownEndsAt;
    private boolean warningTriggered;
    private Team winningTeam;

    public UndercoverGame(String civilianWord, String undercoverWord) {
        this.civilianWord = civilianWord;
        this.undercoverWord = undercoverWord;
    }

    public String getCivilianWord() {
        return civilianWord;
    }

    public void setCivilianWord(String civilianWord) {
        this.civilianWord = civilianWord;
    }

    public String getUndercoverWord() {
        return undercoverWord;
    }

    public void setUndercoverWord(String undercoverWord) {
        this.undercoverWord = undercoverWord;
    }

    public GameStatus getStatus() {
        return status;
    }

    public void setStatus(GameStatus status) {
        this.status = status;
    }

    public Map<String, Participant> getParticipants() {
        return participants;
    }

    public void addParticipant(Participant participant) {
        participants.put(participant.getId(), participant);
    }

    public Participant getParticipant(String participantId) {
        return participants.get(participantId);
    }

    public Map<String, String> getVotes() {
        return votes;
    }

    public void clearVotes() {
        votes.clear();
    }

    public String getUndercoverParticipantId() {
        return undercoverParticipantId;
    }

    public void setUndercoverParticipantId(String undercoverParticipantId) {
        this.undercoverParticipantId = undercoverParticipantId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(Instant startedAt) {
        this.startedAt = startedAt;
    }

    public Instant getVotingStartedAt() {
        return votingStartedAt;
    }

    public void setVotingStartedAt(Instant votingStartedAt) {
        this.votingStartedAt = votingStartedAt;
    }

    public Instant getFinishedAt() {
        return finishedAt;
    }

    public void setFinishedAt(Instant finishedAt) {
        this.finishedAt = finishedAt;
    }

    public Map<String, Participant> getUnmodifiableParticipants() {
        return Collections.unmodifiableMap(participants);
    }

    public Instant getCountdownEndsAt() {
        return countdownEndsAt;
    }

    public void setCountdownEndsAt(Instant countdownEndsAt) {
        this.countdownEndsAt = countdownEndsAt;
    }

    public boolean isWarningTriggered() {
        return warningTriggered;
    }

    public void setWarningTriggered(boolean warningTriggered) {
        this.warningTriggered = warningTriggered;
    }

    public Team getWinningTeam() {
        return winningTeam;
    }

    public void setWinningTeam(Team winningTeam) {
        this.winningTeam = winningTeam;
    }
}
