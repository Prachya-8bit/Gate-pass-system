// Selectors for eprocurement.syssteel.com — extracted from the saved pages in
// pages/ (login-real.html, FrmWorker.aspx.html, DisplayVisitor.aspx saved as
// login.html). If epro changes its pages, re-save them and update here.

export const login = {
  url: 'https://eprocurement.syssteel.com/reg/index.aspx',
  usernameInput: '#txtUserName',
  passwordInput: '#txtPassword',
  submitButton: '#BtnLogin', // image button — submits the form

  // The left tree menu exists on every post-login page (seen in DisplayVisitor.aspx)
  loggedInIndicator: '#ctl00_Menu1_TreeView1',
};

export const regForm = {
  url: 'https://eprocurement.syssteel.com/reg/FrmWorker.aspx',

  // One epro form = one work order: header details + N workers added one by one.
  header: {
    plantSelect: '#ctl00_MainBody_ddlPlant', // values: 4911=SYS-MTP, 4931=SYS-HP, 4951=SYS-BDC
    startDate: '#ctl00_MainBody_txtRTM_VST_STARTDATETIME', // DD/MM/YYYY (ค.ศ.)
    endDate: '#ctl00_MainBody_txtRTM_VST_ENDDATETIME',
    company: '#ctl00_MainBody_txtRTM_VST_SUPPNAME',
    location: '#ctl00_MainBody_txtRTM_VST_LOCATION',
    requesterTel: '#ctl00_MainBody_txtRTM_VST_REQTEL',
    approverSelect: '#ctl00_MainBody_ddlSM', // ผู้อนุมัติ — value comes from EPRO_APPROVER in .env
  },

  worker: {
    name: '#ctl00_MainBody_txtRTM_VST_NAME',
    idCard: '#ctl00_MainBody_txtRTM_VST_IDCARD', // maxlength=13
    position: '#ctl00_MainBody_txtRTM_VST_POSITION',
    addButton: '#ctl00_MainBody_btnAddNewVisitor', // image button — full ASP.NET postback per click
    grid: '#ctl00_MainBody_dgVisitor', // added workers appear as rows here
  },

  submitButton: '#ctl00_MainBody_BtnSaveSendForm',
};

// ฟอร์ม "ขออนุมัตินำรถยนต์เข้ามาปฏิบัติงานภายในโรงงาน"
// เมนู: ยานพาหนะ → ปฏิบัติงานในโรงงาน
//
// เก็บ selector มาจากหน้าจริงด้วย `npm run capture -- --menu "นำรถยนต์" --name FrmVehicle`
// (ดู automation/README.md) — ยืนยันแล้วว่าเปิด URL ตรงได้ ไม่ต้องคลิกผ่านเมนู
// ฟอร์มนี้ไม่มีปุ่ม "เพิ่ม"/ตาราง เพราะห้ามมีผู้โดยสาร กรอกครั้งเดียวแล้วกด Save จบ
export const vehicleForm = {
  url: 'https://eprocurement.syssteel.com/reg/FrmOperation.aspx',

  // selector ที่มีเฉพาะในหน้านี้ ใช้ยืนยันว่าเปิดหน้าถูกก่อนเริ่มพิมพ์อะไรลงไป
  loadedIndicator: '#ctl00_MainBody_txtRTM_VST_CARNO',

  header: {
    plantSelect: '#ctl00_MainBody_ddlPlant', // 4911=SYS-MTP, 4931=SYS-HP, 4951=SYS-BDC
    startDate: '#ctl00_MainBody_txtRTM_VST_STARTDATETIME', // DD/MM/YYYY (ค.ศ.)
    startHour: '#ctl00_MainBody_ddlShour', // 00–23
    startMin: '#ctl00_MainBody_ddlSMin', // ⚠️ ไม่มีค่า "10"
    endDate: '#ctl00_MainBody_txtRTM_VST_ENDDATETIME',
    endHour: '#ctl00_MainBody_ddlEhour',
    endMin: '#ctl00_MainBody_ddlEMin', // ⚠️ ไม่มีค่า "10"
    company: '#ctl00_MainBody_txtRTM_VST_SUPPNAME',
    approverSelect: '#ctl00_MainBody_ddlSM', // ค่าเดียวกับ regForm ใช้ EPRO_APPROVER ได้
  },

  vehicle: {
    driverName: '#ctl00_MainBody_txtRTM_VST_DRIVERNAME',
    plateNumber: '#ctl00_MainBody_txtRTM_VST_CARNO', // ช่องเดียว ไม่แยกหมวดอักษร
    // ⚠️ value ของ option ห่อด้วย non-breaking space (U+00A0) หัวและท้าย
    // เช่น " ระยอง " — ต้องห่อกลับก่อน selectOption ดู PROVINCE_PAD
    provinceSelect: '#ctl00_MainBody_ddlProvience',
    location: '#ctl00_MainBody_txtRTM_VST_LOCATION',
    reason: '#ctl00_MainBody_txtRTM_VST_RESON', // textarea
    requesterTel: '#ctl00_MainBody_txtRTM_VST_REQTEL',
  },

  submitButton: '#ctl00_MainBody_BtnSaveSendForm',
};

/** อักขระที่ EPRO ใช้ห่อ value ของ dropdown จังหวัด — non-breaking space */
export const PROVINCE_PAD = ' ';

/** แปลงชื่อจังหวัดสะอาดที่เก็บใน DB เป็น value ที่ ddlProvience ต้องการ */
export const eproProvinceValue = (name) => `${PROVINCE_PAD}${name}${PROVINCE_PAD}`;
