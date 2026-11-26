package app.hwasaek.android;

final class VersionPolicy {
    static boolean requiresUpdate(int installed, int latest, int minimum) {
        if (installed < 1 || latest < 1 || minimum != latest) throw new IllegalArgumentException("Invalid mandatory version policy");
        return installed < minimum;
    }
}
