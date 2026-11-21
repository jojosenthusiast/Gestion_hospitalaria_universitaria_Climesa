package sv.edu.catolica.climesa.data

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Test
import sv.edu.catolica.climesa.domain.BedBoard

/** S11: bed group headers carry the floor and the room category ("Piso 3 · VIP", "Piso 2 · Semiprivada"). */
class BedFloorCategoryTest {
    private val rows = JSONArray(
        """[
        {"id":"b1","code":"C-301","room":"H-301","roomId":"r301","level":3,"category":"vip","state":"libre","version":1},
        {"id":"b2","code":"C-201A","room":"H-201","roomId":"r201","level":2,"category":"semiprivada","state":"libre","version":1},
        {"id":"b3","code":"C-201B","room":"H-201","roomId":"r201","level":2,"category":"semiprivada","state":"ocupada","version":1},
        {"id":"b4","code":"C-X","room":"H-X","roomId":"rx","level":null,"category":null,"state":"libre","version":1}
        ]""",
    )

    @Test fun theBoardReadsTheCategoryAndGroupsEachFloorWithIt() {
        val beds = parseBeds(rows)
        assertEquals(listOf("vip", "semiprivada", "semiprivada", null), beds.map { it.category })
        val floors = BedBoard.group(beds)
        assertEquals(listOf(2 to "semiprivada", 3 to "vip", null to null), floors.map { it.level to it.category })
        assertEquals(listOf("C-201A", "C-201B"), floors.first().rooms.single().beds.map { it.code })
    }

    @Test fun aFilteredBoardKeepsTheCategoryOfEachFloor() {
        assertEquals(listOf(2 to "semiprivada"), BedBoard.group(parseBeds(rows), "ocupada").map { it.level to it.category })
    }
}