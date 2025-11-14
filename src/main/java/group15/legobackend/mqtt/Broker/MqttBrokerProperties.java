package group15.legobackend.mqtt.Broker;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "mqtt.broker")
public class MqttBrokerProperties {

    private boolean autoStart = true;
    private String host = "0.0.0.0";
    private int port = 1883;
    private Integer websocketPort;
    private String websocketPath = "/";
    private boolean allowAnonymous = true;
    private String storeDirectory = "target/moquette";
    private boolean persistent = true;

    public boolean isAutoStart() {
        return autoStart;
    }

    public void setAutoStart(boolean autoStart) {
        this.autoStart = autoStart;
    }

    public String getHost() {
        return host;
    }

    public void setHost(String host) {
        this.host = host;
    }

    public int getPort() {
        return port;
    }

    public void setPort(int port) {
        this.port = port;
    }

    public Integer getWebsocketPort() {
        return websocketPort;
    }

    public void setWebsocketPort(Integer websocketPort) {
        this.websocketPort = websocketPort;
    }

    public String getWebsocketPath() {
        return websocketPath;
    }

    public void setWebsocketPath(String websocketPath) {
        this.websocketPath = websocketPath;
    }

    public boolean isAllowAnonymous() {
        return allowAnonymous;
    }

    public void setAllowAnonymous(boolean allowAnonymous) {
        this.allowAnonymous = allowAnonymous;
    }

    public String getStoreDirectory() {
        return storeDirectory;
    }

    public void setStoreDirectory(String storeDirectory) {
        this.storeDirectory = storeDirectory;
    }

    public boolean isPersistent() {
        return persistent;
    }

    public void setPersistent(boolean persistent) {
        this.persistent = persistent;
    }
}
