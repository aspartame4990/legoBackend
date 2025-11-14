package group15.legobackend.undercover.controller;

import group15.legobackend.undercover.dto.ParticipantView;
import group15.legobackend.undercover.service.UndercoverGameService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/participants")
public class ParticipantController {

    private final UndercoverGameService gameService;

    public ParticipantController(UndercoverGameService gameService) {
        this.gameService = gameService;
    }

    @GetMapping("/{token}")
    public ResponseEntity<ParticipantView> getParticipant(@PathVariable String token) {
        return ResponseEntity.ok(gameService.getParticipantView(token));
    }
}
