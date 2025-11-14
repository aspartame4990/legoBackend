package group15.legobackend.undercover.controller;

import group15.legobackend.undercover.dto.CreateGameRequest;
import group15.legobackend.undercover.dto.HostGameView;
import group15.legobackend.undercover.dto.JoinGameRequest;
import group15.legobackend.undercover.dto.JoinGameResponse;
import group15.legobackend.undercover.dto.VoteRequest;
import group15.legobackend.undercover.service.UndercoverGameService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/game")
public class UndercoverGameController {

    private final UndercoverGameService gameService;

    public UndercoverGameController(UndercoverGameService gameService) {
        this.gameService = gameService;
    }

    @PostMapping
    public ResponseEntity<HostGameView> createGame(@RequestBody CreateGameRequest request) {
        return ResponseEntity.ok(gameService.createGame(request));
    }

    @GetMapping("/host")
    public ResponseEntity<HostGameView> getHostView() {
        return ResponseEntity.ok(gameService.getHostGame());
    }

    @PostMapping("/participants")
    public ResponseEntity<JoinGameResponse> joinGame(@RequestBody JoinGameRequest request) {
        return ResponseEntity.ok(gameService.joinGame(request));
    }

    @PostMapping("/start")
    public ResponseEntity<Void> startGame() {
        gameService.startGame();
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/votes")
    public ResponseEntity<Void> vote(@RequestBody VoteRequest request) {
        gameService.recordVote(request);
        return ResponseEntity.accepted().build();
    }
}
