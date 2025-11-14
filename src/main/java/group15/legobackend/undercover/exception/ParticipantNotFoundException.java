package group15.legobackend.undercover.exception;

public class ParticipantNotFoundException extends RuntimeException {
    public ParticipantNotFoundException(String participantId) {
        super("Participant %s not found".formatted(participantId));
    }
}
