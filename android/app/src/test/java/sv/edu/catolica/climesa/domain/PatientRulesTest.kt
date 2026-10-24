package sv.edu.catolica.climesa.domain
import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate
class PatientRulesTest {
    private val today=LocalDate.of(2026,10,20)
    private val draft=PatientDraft("Ana María","Prueba Hernández","01234567-8","1990-01-15",Sex.FEMALE,"7000-0000")
    private fun initial()=PatientRules.save(Registry(emptyList(),nextSequence=1),draft,today)
    @Test fun checksDuiVerifier() {assertTrue(PatientRules.validDui(draft.dui));assertFalse(PatientRules.validDui("01234567-9"));assertFalse(PatientRules.validDui("00000000-0"))}
    @Test fun unknownFieldsRemainAbsent() {val p=PatientRules.save(Registry(emptyList()),draft.copy(dui="",birth=""),today).patients.single();assertNull(p.dui);assertNull(p.birth)}
    @Test fun rejectsInvalidDates() {assertTrue("birth" in PatientRules.validate(draft.copy(birth="2026-02-30"),today));assertTrue("birth" in PatientRules.validate(draft.copy(birth="2027-01-01"),today))}
    @Test fun searchesWithoutAccentsOrWordOrder() {val p=initial().patients.single();assertTrue(PatientRules.matches(p,"hernandez ana"));assertTrue(PatientRules.matches(p,"012345678"));assertFalse(PatientRules.matches(p,"Ana Flores"))}
    @Test fun rejectsDuplicateDuiEvenWhenInactive() {val r=initial();val p=r.patients.single();val inactive=PatientRules.setActive(r,p.id,1,false,"Duplicado en revisión");assertThrows(IllegalArgumentException::class.java) {PatientRules.save(inactive,draft.copy(givenNames="Otra persona"),today)}}
    @Test fun rejectsStaleUpdates() {val r=initial();val p=r.patients.single();val changed=PatientRules.save(r,draft.copy(phone="7111-1111"),today,p.id,1,"Corrección de teléfono");assertThrows(IllegalArgumentException::class.java) {PatientRules.save(changed,draft,today,p.id,1,"Otra corrección de teléfono")};assertEquals("7111-1111",changed.patients.single().phone)}
    @Test fun editsPreserveIdentityAndHistory() {val r=initial();val p=r.patients.single();val changed=PatientRules.save(r,draft.copy(surnames="Prueba Vásquez"),today,p.id,1,"Corrección de apellidos");assertEquals(p.id,changed.patients.single().id);assertEquals(p.record,changed.patients.single().record);assertEquals(2,changed.audit.size);assertEquals("Prueba Hernández → Prueba Vásquez",changed.audit.last().changes["Apellidos"])}
    @Test fun changingStatusNeverDeletes() {val r=initial();val p=r.patients.single();val inactive=PatientRules.setActive(r,p.id,1,false,"Inactivación de prueba");assertEquals(1,inactive.patients.size);assertFalse(inactive.patients.single().active);val active=PatientRules.setActive(inactive,p.id,2,true,"Reactivación autorizada");assertTrue(active.patients.single().active);assertEquals(3,active.audit.size)}
    @Test fun requiresReasonAndValidNames() {val r=initial();val p=r.patients.single();assertThrows(IllegalArgumentException::class.java) {PatientRules.setActive(r,p.id,1,false,"")};assertTrue("givenNames" in PatientRules.validate(draft.copy(givenNames="Ana123"),today));assertTrue("givenNames" in PatientRules.validate(draft.copy(givenNames="Ana@"),today))}
    @Test fun recordNumbersAreDistinct() {val r=initial();val next=PatientRules.save(r,draft.copy(dui=""),today);assertEquals(2,next.patients.map {it.record}.distinct().size);assertEquals(PatientRules.record(1),r.patients.single().record);assertEquals(3L,next.nextSequence)}
}
