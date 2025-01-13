const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const currentDatetime = moment();
const dateTime = currentDatetime.format('YYYY-MM-DD HH:mm:ss');
let nyPorfile = '';
let nyDocument = '';
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = file.fieldname === 'profile' ? './image/profile' : './image/docstaff';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        if (file.fieldname === 'profile') {
            nyPorfile = `${Date.now()}_pf${ext}`;
            cb(null, nyPorfile);
        } else if (file.fieldname === 'document') {
            nyDocument = `${Date.now()}_doc${ext}`;
            cb(null, nyDocument);
        }
    }
});

const upload = multer({ storage });

router.post('/create', upload.fields([{ name: 'profile' }, { name: 'document' }]), (req, res) => {
    try {
        const employee_id = uuidv4();
        const {first_name, last_name, birthday, gender, mobile_phone, email,
            district_id_fk, village_name, depart_id_fk, status_user, userEmail, rightsUse
        } = req.body;

        // const uploadedProfile = req.files['profile'] ? req.files['profile'][0].filename : null;
        // const uploadedDocument = req.files['document'] ? req.files['document'][0].filename : null;

        const basic_salary = parseFloat(req.body.basic_salary.replace(/,/g, ''));
        const dob = birthday ? moment(birthday).format('YYYY-MM-DD') : null;
        const genderValue = gender || '';
        const userPassword = bcrypt.hashSync(req.body.userPassword);
        const fields = 'employee_id, code_id, profile, first_name, last_name, birthday, gender, mobile_phone, email, district_id_fk, village_name, depart_id_fk, basic_salary, document, status_inout, create_date';
       
        const codeId=` CASE 
        WHEN MAX(CAST(SUBSTRING(code_id, 5, LENGTH(code_id) - 4) AS UNSIGNED)) IS NOT NULL
        THEN CONCAT('PLC-', LPAD(MAX(CAST(SUBSTRING(code_id, 5, LENGTH(code_id) - 4) AS UNSIGNED)) + 1, 4, '0'))
        ELSE 'PLC-0001'
        END AS idCode`;
        db.queryField('tbl_employee', codeId, (err, result) => {
            if (err) {
                return res.status(500).json({ error: 'Error generating custom code' });
            }
            const code_id=result[0].idCode;
        const data = [
            employee_id, code_id, nyPorfile, first_name, last_name, dob, genderValue,
            mobile_phone, email, district_id_fk, village_name, depart_id_fk, basic_salary, nyDocument, 1, dateTime ];
       
            db.insertData('tbl_employee', fields, data, (err, results) => {
            if (err) {
                return res.status(500).json({ message: 'Error saving employee data', error: err });
            }
            if (status_user === '1') {
                let userName = first_name + '' + last_name;
                let userId = uuidv4();
                const fieldsLogin = `userId,employee_id_fk,userName,userEmail,userPassword,rightsUse,statusUse`;
                const dataLogin = [userId, employee_id, userName, btoa(userEmail), userPassword, rightsUse, '1'];
                db.insertData('tbl_users', fieldsLogin, dataLogin, (err, results) => {
                    if (err) {
                        console.error('Error inserting data:', err);
                        return res.status(500).json({ error: `ການບັນທຶກຂໍ້ມູນບໍ່ສ້ຳເລັດ` });
                    }
                    res.status(200).json({ message: 'ການດຳເນີນງານສຳເລັດແລ້ວ' });
                });
            } else {
                res.status(200).json({ message: 'ການດຳເນີນງານສຳເລັດແລ້ວ' });
            }
        });
    });
    } catch (error) {
        res.status(500).json({ message: 'Server error occurred', error });
    }
});


router.post('/fetch', function (req, res) {
    const { district_id_fk, province_id_fk, depart_id_fk } = req.body;
    let districtId='';
    let provinceId='';
    let departId='';
if(district_id_fk){
    districtId=`AND district_id_fk=${district_id_fk}`;
}
if(province_id_fk){
    provinceId=`AND province_id_fk=${province_id_fk}`;
}
if(depart_id_fk){
    departId=`AND depart_id_fk=${depart_id_fk}`;
}


const tables=`tbl_employee
	LEFT JOIN tbl_district ON  tbl_employee.district_id_fk = tbl_district.district_id
	LEFT JOIN tbl_province ON  tbl_district.province_id_fk = tbl_province.province_id
	LEFT JOIN tbl_department ON  tbl_employee.depart_id_fk = tbl_department.department_id
	LEFT JOIN tbl_users ON  tbl_employee.employee_id = tbl_users.employee_id_fk
	LEFT JOIN tbl_rights_use ON tbl_users.rightsUse = tbl_rights_use.rightsId`;
const fileds=`ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS id,
tbl_employee.employee_id, 
	tbl_employee.code_id, 
	tbl_employee.profile, 
	tbl_employee.first_name, 
	tbl_employee.last_name, 
	tbl_employee.birthday, 
	tbl_employee.gender, 
	tbl_employee.mobile_phone, 
	tbl_employee.email, 
	tbl_employee.district_id_fk, 
	tbl_employee.village_name, 
	tbl_employee.depart_id_fk, 
	tbl_employee.basic_salary, 
	tbl_employee.document, 
	tbl_employee.status_inout, 
	tbl_employee.create_date, 
	tbl_district.district_name, 
	tbl_province.province_name, 
	tbl_department.depart_name, 
	tbl_users.userId, 
	tbl_users.userName, 
	tbl_users.userEmail,
	tbl_users.userPassword, 
    tbl_users.rightsUse,
    tbl_users.statusUse,
	tbl_rights_use.rightsName, 
	tbl_rights_use.inserts, 
	tbl_rights_use.edits, 
	tbl_rights_use.deletes, 
	tbl_rights_use.status_ck`;
const wheres=`status_inout='1' ${departId} ${districtId} ${provinceId}`;
    db.queryConditions(tables, fileds, wheres, (err, results) => {
        if (err) {
            console.error('Error inserting data:', err);
        }
        res.status(200).json(results);
    });
});
router.get("/option", function (req, res) {
    const where=`status_inout='1'`;
    db.queryData('tbl_employee', where,(err, results) => {
        if (err) {
            return res.status(400).send();
        }
        res.status(200).json(results);
    });
});

module.exports = router;