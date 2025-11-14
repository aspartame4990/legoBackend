package group15.legobackend.mqtt.Client;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/mqtt")
public class MqttClientController {

    private final MqttGateway mqttGateway;

    public MqttClientController(MqttGateway mqttGateway) {
        this.mqttGateway = mqttGateway;
    }

    @PostMapping("/publish")
    public ResponseEntity<String> publish(@RequestBody PublishRequest request) {
        if (request.payload() == null || request.payload().isBlank()) {
            return ResponseEntity.badRequest().body("payload must not be blank");
        }
        if (request.topic() != null && !request.topic().isBlank()) {
            mqttGateway.sendToTopic(request.topic(), request.payload());
        } else {
            mqttGateway.send(request.payload());
        }
        return ResponseEntity.accepted().body("Message dispatched to MQTT broker");
    }

    public record PublishRequest(String topic, String payload) {
    }
}
