package group15.legobackend;

import group15.legobackend.mqtt.Broker.MqttBrokerProperties;
import group15.legobackend.mqtt.Client.MqttClientProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties({MqttBrokerProperties.class, MqttClientProperties.class})
public class LegoBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(LegoBackendApplication.class, args);
    }

}
