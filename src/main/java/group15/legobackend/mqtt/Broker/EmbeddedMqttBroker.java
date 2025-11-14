package group15.legobackend.mqtt.Broker;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Properties;

import io.moquette.BrokerConstants;
import io.moquette.broker.Server;
import io.moquette.broker.config.IConfig;
import io.moquette.broker.config.MemoryConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

@Component
public class EmbeddedMqttBroker implements SmartLifecycle {

    private static final Logger log = LoggerFactory.getLogger(EmbeddedMqttBroker.class);

    private final Server server = new Server();
    private final IConfig config;
    private final boolean autoStart;
    private final String host;
    private final int port;
    private final Integer websocketPort;
    private volatile boolean running;

    public EmbeddedMqttBroker(MqttBrokerProperties properties) {
        this.autoStart = properties.isAutoStart();
        this.host = properties.getHost();
        this.port = properties.getPort();
        this.websocketPort = properties.getWebsocketPort();
        this.config = buildConfig(properties);
    }

    private IConfig buildConfig(MqttBrokerProperties properties) {
        Properties configProps = new Properties();
        configProps.setProperty(BrokerConstants.HOST_PROPERTY_NAME, properties.getHost());
        configProps.setProperty(BrokerConstants.PORT_PROPERTY_NAME, Integer.toString(properties.getPort()));
        configProps.setProperty(BrokerConstants.ALLOW_ANONYMOUS_PROPERTY_NAME, Boolean.toString(properties.isAllowAnonymous()));

        Path storePath = prepareStorePath(properties.getStoreDirectory());
        configProps.setProperty(BrokerConstants.PERSISTENT_STORE_PROPERTY_NAME, storePath.toString());

        if (properties.getWebsocketPort() != null) {
            configProps.setProperty(BrokerConstants.WEB_SOCKET_PORT_PROPERTY_NAME,
                    Integer.toString(properties.getWebsocketPort()));
            configProps.setProperty(BrokerConstants.WEB_SOCKET_PATH_PROPERTY_NAME, properties.getWebsocketPath());
        }

        return new MemoryConfig(configProps);
    }

    private Path prepareStorePath(String directory) {
        Path path = Paths.get(directory).toAbsolutePath();
        try {
            Files.createDirectories(path);
        } catch (IOException e) {
            throw new IllegalStateException("Unable to create MQTT store directory " + path, e);
        }
        return path.resolve("moquette_store.mapdb");
    }

    @Override
    public void start() {
        if (running || !autoStart) {
            return;
        }
        try {
            server.startServer(config);
            running = true;
            if (websocketPort != null) {
                log.info("Moquette MQTT broker started on {}:{} (websocket on {})", host, port, websocketPort);
            } else {
                log.info("Moquette MQTT broker started on {}:{}", host, port);
            }
        } catch (IOException e) {
            throw new IllegalStateException("Failed to start embedded MQTT broker", e);
        }
    }

    @Override
    public void stop() {
        if (!running) {
            return;
        }
        server.stopServer();
        running = false;
        log.info("Moquette MQTT broker stopped");
    }

    @Override
    public void stop(Runnable callback) {
        stop();
        callback.run();
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public boolean isAutoStartup() {
        return autoStart;
    }

    @Override
    public int getPhase() {
        return Integer.MIN_VALUE;
    }
}
