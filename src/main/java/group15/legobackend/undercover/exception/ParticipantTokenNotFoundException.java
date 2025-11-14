package group15.legobackend.undercover.exception;

public class ParticipantTokenNotFoundException extends RuntimeException {
    public ParticipantTokenNotFoundException() {
        super("Participant token is invalid or expired");
    }
}
