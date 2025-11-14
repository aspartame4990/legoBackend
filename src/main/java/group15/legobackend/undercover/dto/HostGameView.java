package group15.legobackend.undercover.dto;

import group15.legobackend.undercover.model.GameStatus;

import java.util.List;

public record HostGameView(
        String civilianWord,
        String undercoverWord,
        GameStatus status,
        boolean countdownActive,
        long secondsToVoting,
        int totalParticipants,
        List<HostParticipantView> participants,
        String undercoverParticipantId,
        List<VoteSummaryItem> voteSummary
) {
}
