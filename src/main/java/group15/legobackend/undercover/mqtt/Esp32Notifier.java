package group15.legobackend.undercover.mqtt;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import group15.legobackend.mqtt.Client.MqttGateway;
import group15.legobackend.undercover.model.Participant;
import group15.legobackend.undercover.model.Team;
import group15.legobackend.undercover.model.WordGroup;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;

@Component
public class Esp32Notifier {

    private static final Logger log = LoggerFactory.getLogger(Esp32Notifier.class);
    private static final String PLAYER_TOPIC = "undercover/player/%s";
    private static final String BROADCAST_TOPIC = "undercover/broadcast";

    private final MqttGateway mqttGateway;
    private final ObjectMapper objectMapper;

    public Esp32Notifier(MqttGateway mqttGateway, ObjectMapper objectMapper) {
        this.mqttGateway = mqttGateway;
        this.objectMapper = objectMapper;
    }

    public void notifyWordAssignment(Participant participant) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "word_assignment");
        payload.put("wordIndex", participant.getWordGroup() == WordGroup.WORD_ONE ? 1 : 2);
        payload.put("pattern", participant.getWordGroup() == WordGroup.WORD_ONE ? "3short_1long" : "2short_2long");
        payload.put("word", participant.getWord());
        publishToPlayer(participant, payload);
    }

    public void notifyCountdownWarning(long secondsRemaining) {
        Map<String, Object> payload = Map.of(
                "type", "countdown_warning",
                "secondsRemaining", secondsRemaining,
                "action", "beep"
        );
        publishBroadcast(payload);
    }

    public void notifyVotingStarted() {
        Map<String, Object> payload = Map.of(
                "type", "voting_started",
                "message", "Voting phase has begun"
        );
        publishBroadcast(payload);
    }

    public void notifyGameResult(Collection<Participant> participants, Team winningTeam) {
        if (winningTeam == null) {
            return;
        }
        for (Participant participant : participants) {
            boolean winner = (winningTeam == Team.CIVILIANS && !participant.isUndercover())
                    || (winningTeam == Team.UNDERCOVER && participant.isUndercover());
            Map<String, Object> payload = Map.of(
                    "type", "game_result",
                    "winner", winner,
                    "team", winningTeam.name(),
                    "color", winner ? "green" : "red"
            );
            publishToPlayer(participant, payload);
        }
    }

    private void publishToPlayer(Participant participant, Map<String, Object> payload) {
        String topic = PLAYER_TOPIC.formatted(participant.getName());
        publish(topic, payload);
    }

    private void publishBroadcast(Map<String, Object> payload) {
        String topic = BROADCAST_TOPIC;
        publish(topic, payload);
    }

    private void publish(String topic, Map<String, Object> payload) {
        try {
            String json = objectMapper.writeValueAsString(payload);
            mqttGateway.sendToTopic(topic, json);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize ESP32 payload for topic {}", topic, e);
        }
    }
}
