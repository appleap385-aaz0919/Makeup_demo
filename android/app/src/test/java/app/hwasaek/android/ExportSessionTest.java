package app.hwasaek.android;
import org.junit.Test;
import static org.junit.Assert.*;
public class ExportSessionTest {
    @Test public void closeWithoutCompletionDoesNotSave() { assertFalse(new ExportSession().dismiss()); }
    @Test public void rewardIsSingleUse() { ExportSession s=new ExportSession();s.earned();assertTrue(s.dismiss());assertFalse(s.dismiss()); }
    @Test public void lateRewardAfterCancelDoesNotSave() { ExportSession s=new ExportSession();s.cancel();s.earned();assertFalse(s.dismiss()); }
    @Test public void cancellationDiscardsAlreadyEarnedReward() { ExportSession s=new ExportSession();s.earned();s.cancel();assertFalse(s.dismiss()); }
    @Test public void unavailableAdAllowsOneFreeExport() { ExportSession s=new ExportSession();assertTrue(s.unavailable());assertFalse(s.unavailable());assertFalse(s.dismiss()); }
    @Test public void userClosedAdCannotBecomeFreeExport() { ExportSession s=new ExportSession();assertFalse(s.dismiss());assertFalse(s.unavailable()); }
    @Test public void cancellationRejectsUnavailableAndLateRewards() { ExportSession s=new ExportSession();s.cancel();assertFalse(s.unavailable());s.earned();assertFalse(s.dismiss()); }
    @Test public void currentAndFutureVersionsWork() { assertFalse(VersionPolicy.requiresUpdate(2,2,2));assertFalse(VersionPolicy.requiresUpdate(3,2,2)); }
    @Test public void oldVersionIsBlocked() { assertTrue(VersionPolicy.requiresUpdate(1,2,2)); }
    @Test(expected=IllegalArgumentException.class) public void inconsistentPolicyCannotEnableOldApp() { VersionPolicy.requiresUpdate(1,2,1); }
}
