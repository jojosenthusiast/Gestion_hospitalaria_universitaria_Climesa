package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class AccessRoutingTest {
    @Test fun unverifiedSessionNeverReceivesAnAndroidModule() {
        assertEquals(AndroidDestination.PENDING_VERIFICATION, AccessProfile().androidDestination())
    }

    @Test fun patientGoesToPatientPortal() {
        assertEquals(AndroidDestination.PATIENT, AccessProfile(listOf("PAC"), verifiedByBackend = true).androidDestination())
    }

    @Test fun receptionistGoesToReception() {
        assertEquals(AndroidDestination.RECEPTION, AccessProfile(listOf("REC"), verifiedByBackend = true).androidDestination())
    }

    @Test fun webOnlyAdminIsNotGrantedAndroidOperations() {
        assertEquals(AndroidDestination.NOT_AVAILABLE, AccessProfile(listOf("ADM"), verifiedByBackend = true).androidDestination())
    }
}
