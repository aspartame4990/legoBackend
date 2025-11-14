package group15.legobackend.undercover.dto;

public record VoteRequest(
        String voterToken,
        String targetParticipantId
) {
}
