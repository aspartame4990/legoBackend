package group15.legobackend.mqtt.Client;

import org.springframework.integration.annotation.MessagingGateway;
import org.springframework.integration.mqtt.support.MqttHeaders;
import org.springframework.messaging.handler.annotation.Header;

@MessagingGateway(defaultRequestChannel = "mqttOutboundChannel")
public interface MqttGateway {

    void send(String payload);

    void sendToTopic(@Header(MqttHeaders.TOPIC) String topic, String payload);
}
