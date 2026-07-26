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
