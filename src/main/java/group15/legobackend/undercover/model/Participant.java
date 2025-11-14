package group15.legobackend.undercover.model;

public class Participant {

    private final String id;
    private final String token;
    private final String name;
    private boolean undercover;
    private String word;
    private boolean hasVoted;
    private WordGroup wordGroup = WordGroup.WORD_ONE;

    public Participant(String id, String token, String name) {
        this.id = id;
        this.token = token;
        this.name = name;
    }

    public String getId() {
        return id;
    }

    public String getToken() {
        return token;
    }

    public String getName() {
        return name;
    }

    public boolean isUndercover() {
        return undercover;
    }

    public void setUndercover(boolean undercover) {
        this.undercover = undercover;
    }

    public String getWord() {
        return word;
    }

    public void setWord(String word) {
        this.word = word;
    }

    public boolean hasVoted() {
        return hasVoted;
    }

    public void setHasVoted(boolean hasVoted) {
        this.hasVoted = hasVoted;
    }

    public boolean canVote() {
        return true;
    }

    public WordGroup getWordGroup() {
        return wordGroup;
    }

    public void setWordGroup(WordGroup wordGroup) {
        this.wordGroup = wordGroup;
    }
}
