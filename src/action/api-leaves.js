const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const currentDatetime = moment();
const dateTime = currentDatetime.format('YYYY-MM-DD HH:mm:ss');
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './image/document'); // Save uploaded files in the `uploads` directory
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `Lv-${Date.now()}${ext}`);
    },
});
const upload = multer({ storage });
const tables = 'tbl_request_leave';
// Endpoint to handle form data and file uploads
router.post('/create', upload.single('file_leave'), (req, res) => {
    const { leaves_id, staff_id_fk, days, type_leave, confirm, description, files } = req.body;
    let file_leave = req.file ? req.file.filename : null;
    const request_date = moment(req.body.request_date).format('YYYY-MM-DD');
    const start_date = moment(req.body.start_date).format('YYYY-MM-DD');
    const end_date = moment(req.body.end_date).format('YYYY-MM-DD');
    const create_date = moment().format('YYYY-MM-DD HH:mm:ss');
    if (leaves_id === 'null') {
        const fields = 'leaves_id, staff_id_fk, request_date, start_date, end_date,days, type_leave, confirm, description, file_leave,status_del,create_date';
        const values = [uuidv4(), staff_id_fk, request_date, start_date, end_date, days, type_leave, confirm, description, file_leave, 1, create_date];
        db.insertData(tables, fields, values, (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Error creating leave' });
            }
            return res.status(200).json({ message: 'Leave created successfully', data: results });
        });
    } else {
        if (files !== null && file_leave) {
            const filePath = path.join('image/document', files);
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error('Error deleting file:', err);
                }
            });
        }
        if (!file_leave) {
            file_leave = files;
        }
        const fieldsEd = 'staff_id_fk, request_date, start_date, end_date,days, type_leave, confirm, description, file_leave';
        const valuesEd = [staff_id_fk, request_date, start_date, end_date, days, type_leave, confirm, description, file_leave, leaves_id];
        const condition = 'leaves_id=?';
        db.updateData(tables, fieldsEd, valuesEd, condition, (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Error creating leave' });
            }
            return res.status(200).json({ message: 'Leave created successfully', data: results });
        });
    }
});

router.post('/fetch', (req, res) => {
    const { start_date, end_date, staff_id_fk, depart_id_fk, type_leave, confirm } = req.body;
    let staffId = '';
    if (staff_id_fk) {
        staffId = `AND  staff_id_fk='${staff_id_fk}'`;
    }
    let departId = '';
    if (depart_id_fk) {
        departId = `AND depart_id_fk='${depart_id_fk}'`;
    }
    let typeLeave = '';
    if (type_leave) {
        typeLeave = `AND type_leave='${type_leave}'`;
    }
    let confirmLeave = '';
    if (confirm) {
        confirmLeave = `AND confirm='${confirm}'`;
    }
    const startDate = moment(start_date).format('YYYY-MM-DD');
    const endDate = moment(end_date).format('YYYY-MM-DD');

    let dateSearch = `AND start_date BETWEEN '${startDate}' AND '${endDate}'`;
    if (start_date === null && end_date === null) {
        dateSearch = '';
    }

    const fields = `tbl_request_leave.*, 
	tbl_employee.first_name, 
	tbl_employee.last_name, 
	tbl_department.depart_name, 
	tbl_type_leave.typeName`;
    const condition = `status_del=1 ${dateSearch} ${staffId} ${departId} ${typeLeave} ${confirmLeave}`;
    const tables = `tbl_request_leave
    LEFT JOIN tbl_employee ON tbl_request_leave.staff_id_fk=tbl_employee.employee_id
    LEFT JOIN tbl_department ON tbl_employee.depart_id_fk=tbl_department.department_id
    LEFT JOIN tbl_type_leave ON tbl_request_leave.type_leave=tbl_type_leave.typeId`;
    db.queryConditions(tables, fields, condition, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error deleting leave' });
        }
        res.status(200).json(results);
    });
});

router.get('/confirm/:id', (req, res) => {
    const leaves_id = req.params.id;
    const fields = 'confirm';
    const values = [2, leaves_id];
    const condition = 'leaves_id=?';
    db.updateData(tables, fields, values, condition, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error deleting leave' });
        }
        res.status(200).json({ message: 'Leave created successfully', data: results });
    });
});


router.post('/confirmAll', (req, res) => {
    const { leaves_id } = req.body;
    if (!leaves_id || !Array.isArray(leaves_id)) {
        return res.status(400).json({ error: 'Invalid leaves_id format' });
    }

    const fields = 'confirm';
    const values = [2, leaves_id];
    const condition = 'leaves_id IN (?)';
    db.updateData(tables, fields, values, condition, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error deleting leave' });
        }
        res.status(200).json({ message: 'Leave created successfully', data: results });
    });
});


module.exports = router;