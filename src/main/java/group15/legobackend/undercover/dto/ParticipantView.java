package group15.legobackend.undercover.dto;

import group15.legobackend.undercover.model.GameStatus;

import java.util.List;

public record ParticipantView(
        String participantId,
        String name,
        GameStatus status,
        String word,
        String civilianWord,
        String undercoverWord,
        boolean countdownActive,
        long secondsToVoting,
        boolean canVote,
        boolean hasVoted,
        List<ParticipantListItem> participants,
        List<VoteSummaryItem> voteSummary
) {
}
