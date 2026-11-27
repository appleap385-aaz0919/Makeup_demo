package app.hwasaek.android;

/** A completed reward or an unavailable ad can unlock one image, once. */
final class ExportSession {
    private boolean rewarded, closed;
    void earned() { if (!closed) rewarded = true; }
    boolean dismiss() { if (closed) return false; closed = true; return rewarded; }
    boolean unavailable() { if (closed) return false; closed = true; return true; }
    void cancel() { closed = true; rewarded = false; }
}
