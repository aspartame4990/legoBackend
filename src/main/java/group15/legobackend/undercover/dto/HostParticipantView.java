package group15.legobackend.undercover.dto;

public record HostParticipantView(
        String participantId,
        String name,
        boolean undercover,
        String word,
        boolean hasVoted
) {
}
