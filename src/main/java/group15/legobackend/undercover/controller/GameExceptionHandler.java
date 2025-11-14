package group15.legobackend.undercover.controller;

import group15.legobackend.undercover.exception.InvalidGameStateException;
import group15.legobackend.undercover.exception.ParticipantNotFoundException;
import group15.legobackend.undercover.exception.ParticipantTokenNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class GameExceptionHandler {

    @ExceptionHandler({ParticipantNotFoundException.class, ParticipantTokenNotFoundException.class})
    public ResponseEntity<Map<String, String>> handleParticipantErrors(RuntimeException ex) {
        return buildResponse(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler({InvalidGameStateException.class, IllegalArgumentException.class})
    public ResponseEntity<Map<String, String>> handleBadRequest(RuntimeException ex) {
        return buildResponse(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleOthers(Exception ex) {
        return buildResponse(HttpStatus.INTERNAL_SERVER_ERROR, "服务器出现异常，请稍后重试");
    }

    private ResponseEntity<Map<String, String>> buildResponse(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of("message", message));
    }
}
