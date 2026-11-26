package app.hwasaek.android;

/** Exactly one completed reward can unlock exactly one pending image. */
final class ExportSession {
    private boolean rewarded, closed;
    void earned() { if (!closed) rewarded = true; }
    boolean dismiss() { if (closed) return false; closed = true; return rewarded; }
    void cancel() { closed = true; rewarded = false; }
}
