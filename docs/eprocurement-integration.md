> **⚠️ อัปเดต 2026-07-26:** ระบบ sync เปลี่ยนเป็น state machine แล้ว ดูรายละเอียดทั้งหมดที่ [sync-state-machine.md](./sync-state-machine.md)
>
> สัญญา API (Integration API) เปลี่ยนจาก `GET /api/integration/records` เป็น:
> - **`POST /api/integration/claim`** — RPA จองใบงาน (server จัดกลุ่ม + compare-and-set)
> - **`POST /api/integration/report`** — RPA รายงานผล (ok / failed / unknown)
> - **`GET /api/integration/records`** — อ่านอย่างเดียว (เพิ่ม `?status=` filter)
>
> การยืนยันก่อนส่ง (Admin confirm) เป็น mandatory — ดู workflow ใน sync-state-machine.md

# การเชื่อมต่อข้อมูล Gate Pass → ระบบ eprocurement

เอกสารสำหรับทีม IT ที่ดูแล `eprocurement.syssteel.com` เพื่อตั้งค่าดึงข้อมูลการลงทะเบียนคนงานจากระบบ Gate Pass แบบอัตโนมัติ

## Endpoint

```
GET <BASE_URL>/api/integration/records
```

- ระหว่างทดสอบ: `http://localhost:4009/api/integration/records`
- หลัง deploy จริง: `https://<ชื่อแอป>.vercel.app/api/integration/records` (จะแจ้ง URL จริงอีกครั้ง)

## การยืนยันตัวตน

ใส่ API Key ใน HTTP header ทุกครั้ง:

```
x-api-key: <API_KEY ที่ได้รับจากผู้ดูแลระบบ Gate Pass>
```

- ไม่มี key / key ผิด → `401 {"error":"ไม่มีสิทธิ์เข้าถึง"}`
- **ห้ามฝัง key ในโค้ดหรือ URL** — เก็บใน configuration/secret store ของฝั่ง eprocurement
- Key ของเครื่องทดสอบและ production เป็นคนละตัวกัน

## ตัวกรอง (query string, ใส่หรือไม่ใส่ก็ได้)

| พารามิเตอร์ | ความหมาย | ตัวอย่าง |
|---|---|---|
| `company` | ชื่อบริษัทตรงตัว (URL-encode ภาษาไทย) | `?company=บจก.%20ไทยอิเล็คทริค` |
| `from` | วันที่บันทึกข้อมูล ตั้งแต่ (YYYY-MM-DD) | `?from=2026-07-01` |
| `to` | วันที่บันทึกข้อมูล ถึง (YYYY-MM-DD) | `?to=2026-07-31` |

รูปแบบวันที่ผิด → `400 {"error":"รูปแบบวันที่ต้องเป็น YYYY-MM-DD"}`

สำหรับ job รายวัน แนะนำดึงเฉพาะข้อมูลใหม่ด้วย `?from=<วันที่ล่าสุดที่ดึงไปแล้ว>`

## รูปแบบข้อมูลตอบกลับ

```json
{
  "count": 2,
  "records": [
    {
      "id": "cmqfghnah000fea4ytojoa94t",
      "name": "นายอนุชา รักงาน",
      "idCard": "7600678901234",
      "company": "บจก. ไทยอิเล็คทริค",
      "job": "ช่างประปา",
      "zone": "Zone A",
      "startDate": "2026-06-01",
      "endDate": "2026-06-10",
      "manDays": 10,
      "accident": false,
      "createdAt": "2026-06-01",
      "author": { "credential": "0812345678" }
    }
  ]
}
```

| ฟิลด์ | ความหมาย |
|---|---|
| `id` | รหัสอ้างอิง record (ไม่ซ้ำ ใช้กันข้อมูลซ้ำฝั่งปลายทางได้) |
| `name` | ชื่อ-นามสกุลคนงาน |
| `idCard` | เลขบัตรประชาชน 13 หลัก |
| `company` | บริษัทผู้รับเหมา |
| `job` / `zone` | ตำแหน่งงาน / โซนปฏิบัติงาน (อาจเป็น `null`) |
| `startDate` / `endDate` | ช่วงวันที่ปฏิบัติงาน |
| `manDays` | จำนวน man-days (นับรวมวันเริ่มและวันสิ้นสุด) |
| `accident` | มีประวัติอุบัติเหตุในงานนี้หรือไม่ |
| `createdAt` | วันที่ลงทะเบียนในระบบ |
| `author.credential` | เบอร์โทร/อีเมลของผู้รับเหมาที่กรอกข้อมูล |

## ตัวอย่างการเรียก

```bash
curl -H "x-api-key: <API_KEY>" \
  "https://<BASE_URL>/api/integration/records?from=2026-07-01&to=2026-07-31"
```

## หมายเหตุด้านความปลอดภัย

- Endpoint นี้เป็น **read-only** — เรียกได้เฉพาะ GET ไม่สามารถแก้ไข/ลบข้อมูลได้
- ข้อมูลมีเลขบัตรประชาชนเต็ม 13 หลัก จัดเป็นข้อมูลส่วนบุคคล — จำกัดสิทธิ์การเข้าถึง log และฐานข้อมูลฝั่งปลายทางตามนโยบาย PDPA ของบริษัท
- หาก key รั่วไหล แจ้งผู้ดูแลระบบ Gate Pass เพื่อออก key ใหม่ได้ทันที (เปลี่ยนค่า `INTEGRATION_API_KEY` แล้ว restart)
