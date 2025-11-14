package group15.legobackend.mqtt.Client;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "mqtt.client")
public class MqttClientProperties {

    private boolean enabled = true;
    private List<String> brokerUrls = new ArrayList<>(List.of("tcp://localhost:1883"));
    private String clientId = "legoBackendClient";
    private String username;
    private String password;
    private List<String> inboundTopics = new ArrayList<>(List.of("integration/test"));
    private String defaultTopic = "integration/test";
    private int qos = 1;
    private Duration completionTimeout = Duration.ofSeconds(5);

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public List<String> getBrokerUrls() {
        return brokerUrls;
    }

    public void setBrokerUrls(List<String> brokerUrls) {
        this.brokerUrls = brokerUrls;
    }

    public String getClientId() {
        return clientId;
    }

    public void setClientId(String clientId) {
        this.clientId = clientId;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public List<String> getInboundTopics() {
        return inboundTopics;
    }

    public void setInboundTopics(List<String> inboundTopics) {
        this.inboundTopics = inboundTopics;
    }

    public String getDefaultTopic() {
        return defaultTopic;
    }

    public void setDefaultTopic(String defaultTopic) {
        this.defaultTopic = defaultTopic;
    }

    public int getQos() {
        return qos;
    }

    public void setQos(int qos) {
        this.qos = qos;
    }

    public Duration getCompletionTimeout() {
        return completionTimeout;
    }

    public void setCompletionTimeout(Duration completionTimeout) {
        this.completionTimeout = completionTimeout;
    }
}
