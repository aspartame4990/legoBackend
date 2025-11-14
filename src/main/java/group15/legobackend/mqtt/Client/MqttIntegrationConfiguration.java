package group15.legobackend.mqtt.Client;

import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.integration.annotation.ServiceActivator;
import org.springframework.integration.channel.DirectChannel;
import org.springframework.integration.channel.PublishSubscribeChannel;
import org.springframework.integration.config.EnableIntegration;
import org.springframework.integration.mqtt.core.DefaultMqttPahoClientFactory;
import org.springframework.integration.mqtt.core.MqttPahoClientFactory;
import org.springframework.integration.mqtt.inbound.MqttPahoMessageDrivenChannelAdapter;
import org.springframework.integration.mqtt.outbound.MqttPahoMessageHandler;
import org.springframework.integration.mqtt.support.MqttHeaders;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageHandler;

@Configuration
@EnableIntegration
@ConditionalOnProperty(prefix = "mqtt.client", name = "enabled", havingValue = "true", matchIfMissing = true)
public class MqttIntegrationConfiguration {

    private static final Logger log = LoggerFactory.getLogger(MqttIntegrationConfiguration.class);

    @Bean
    public MqttConnectOptions mqttConnectOptions(MqttClientProperties properties) {
        MqttConnectOptions options = new MqttConnectOptions();
        options.setServerURIs(properties.getBrokerUrls().toArray(String[]::new));
        options.setAutomaticReconnect(true);
        options.setCleanSession(true);
        if (properties.getUsername() != null && !properties.getUsername().isBlank()) {
            options.setUserName(properties.getUsername());
        }
        if (properties.getPassword() != null && !properties.getPassword().isBlank()) {
            options.setPassword(properties.getPassword().toCharArray());
        }
        int timeoutSeconds = (int) Math.max(1, properties.getCompletionTimeout().toSeconds());
        options.setConnectionTimeout(timeoutSeconds);
        return options;
    }

    @Bean
    public MqttPahoClientFactory mqttClientFactory(MqttConnectOptions options) {
        DefaultMqttPahoClientFactory factory = new DefaultMqttPahoClientFactory();
        factory.setConnectionOptions(options);
        return factory;
    }

    @Bean
    public MessageChannel mqttInboundChannel() {
        return new PublishSubscribeChannel();
    }

    @Bean
    public MessageChannel mqttOutboundChannel() {
        return new DirectChannel();
    }

    @Bean
    public MqttPahoMessageDrivenChannelAdapter mqttInboundAdapter(
            MqttPahoClientFactory factory,
            MqttClientProperties properties,
            MessageChannel mqttInboundChannel) {
        MqttPahoMessageDrivenChannelAdapter adapter = new MqttPahoMessageDrivenChannelAdapter(
                properties.getClientId() + "-inbound",
                factory,
                properties.getInboundTopics().toArray(String[]::new));
        adapter.setQos(properties.getQos());
        adapter.setAutoStartup(true);
        adapter.setOutputChannel(mqttInboundChannel);
        return adapter;
    }

    @Bean
    @ServiceActivator(inputChannel = "mqttInboundChannel")
    public MessageHandler mqttInboundLogger() {
        return message -> log.info("Inbound MQTT message on topic {} => {}",
                message.getHeaders().get(MqttHeaders.RECEIVED_TOPIC), message.getPayload());
    }

    @Bean
    @ServiceActivator(inputChannel = "mqttOutboundChannel")
    public MessageHandler mqttOutboundHandler(MqttPahoClientFactory factory, MqttClientProperties properties) {
        MqttPahoMessageHandler handler = new MqttPahoMessageHandler(properties.getClientId() + "-outbound", factory);
        handler.setAsync(true);
        handler.setDefaultQos(properties.getQos());
        handler.setDefaultTopic(properties.getDefaultTopic());
        handler.setCompletionTimeout(properties.getCompletionTimeout().toMillis());
        return handler;
    }
}
