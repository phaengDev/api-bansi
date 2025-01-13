const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const db = require('../config/db');
const tables = 'tbl_lack_work';

router.post("/create", function (req, res) {
    const { lack_work_id, staff_id_fk, status_lack, description, user_create } = req.body;
    const lack_date = moment(req.body.lack_date).format('YYYY-MM-DD');
    const create_date = moment().format('YYYY-MM-DD HH:mm:ss');

    if (lack_work_id === null) {
        const wheres = `staff_id_fk='${staff_id_fk}' AND lack_date='${lack_date}' AND status_del=1`;
        db.queryData(tables, wheres, (err, results) => {
            if (err) {
                return res.status(400).send();
            }
            if (results.length > 0) {
                return res.status(201).json({ message: 'ຂໍ້ມູນນີ້ມີການບັນທຶກແລ້ວວັນນີ້', data: results });
            } else {
                const fields = 'lack_work_id, staff_id_fk,status_lack,description,lack_date,status_del,status_off,user_create,create_date';
                const data = [uuidv4(), staff_id_fk, status_lack, description, lack_date, 1,1, user_create, create_date];
                db.insertData(tables, fields, data, (err, results) => {
                    if (err) {
                        console.error('Error inserting data:', err);
                        return res.status(500).json({ error: `ການບັນທຶກຂໍ້ມູນບໍ່ສ້ຳເລັດ` });
                    }
                    console.log('Data inserted successfully:', results);
                    res.status(200).json({ message: 'ການດຳເນີນງານສຳເລັດແລ້ວ', data: results });
                });
            }
        });
    } else {
        const field = 'staff_id_fk,status_lack,description,lack_date,user_create,create_date';
        const newData = [staff_id_fk, status_lack, description, lack_date, user_create, create_date, lack_work_id];
        const condition = 'lack_work_id=?';
        db.updateData(tables, field, newData, condition, (err, results) => {
            if (err) {
                console.error('Error updating data:', err);
                return res.status(500).json({ error: 'ແກ້ໄຂຂໍ້ມູນບໍ່ສຳເລັດ ກະລຸນາກວອສອນແລ້ວລອງໃໝ່ອິກຄັ້ງ' });
            }
            console.log('Data updated successfully:', results);
            res.status(200).json({ message: 'ການແກ້ໄຂຂໍ້ມູນສຳເລັດ', data: results });
        });
    }
});

router.delete("/:id", function (req, res, next) {
    const lack_work_id = req.params.id;
    const where = `lack_work_id='${lack_work_id}'`;
    db.deleteData(tables, where, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'ຂໍອະໄພການລືບຂໍ້ມູນບໍ່ສຳເລັດ' });
        }
        res.status(200).json({ message: 'ການດຳເນີນງານສຳເລັດແລ້ວ', data: results });
    });
});

    router.post("/query", function (req, res) {
    const { staff_id_fk,depart_id_fk,status_lack } = req.body;
    const start_date = moment(req.body.start_date).format('YYYY-MM-DD');
    const end_date = moment(req.body.end_date).format('YYYY-MM-DD');

    let staffId = '';
    if(staff_id_fk){
        staffId = `AND  staff_id_fk='${staff_id_fk}'`;
    }
    let departId = '';
    if(depart_id_fk){
        departId = `AND depart_id_fk='${depart_id_fk}'`;
    }
    let statusLack = '';
    if(status_lack){
        statusLack = `AND status_lack='${status_lack}'`;
    }

    const tables = `tbl_lack_work
    LEFT JOIN tbl_employee ON tbl_lack_work.staff_id_fk=tbl_employee.employee_id
    LEFT JOIN tbl_department ON tbl_employee.depart_id_fk=tbl_department.department_id`;
    const fileds = `tbl_lack_work.*, 
	tbl_employee.first_name, 
	tbl_employee.last_name, 
	tbl_department.depart_name`;
    const condition = `status_del = 1 AND lack_date BETWEEN '${start_date}' AND '${end_date}' ${staffId} ${departId} ${statusLack}`;
    db.queryConditions(tables,fileds,condition, (err, results) => {
        if (err) {
            return res.status(400).send();
        }
        res.status(200).json(results);
    });
});

router.post("/fetch", function (req, res) {
    const {start_date,end_date, depart_id_fk,status_lack,status_off } = req.body;

    const startDate = moment(start_date).format('YYYY-MM-DD');
    const endDate = moment(end_date).format('YYYY-MM-DD');

    let searchDate=  '';
        if(start_date !== null && end_date !== null){
            searchDate  = `AND lack_date BETWEEN '${startDate}' AND '${endDate}'`;
        }
        let statusOff = '';
        if(status_off){
            statusOff = `AND status_off='${status_off}'`;
        }

    let departId = '';
    if(depart_id_fk){
        departId = `AND depart_id_fk='${depart_id_fk}'`;
    }
    let statusLack = '';
    if(status_lack){
        statusLack = `AND status_lack='${status_lack}'`;
    }

    const tables = `tbl_lack_work
    LEFT JOIN tbl_employee ON tbl_lack_work.staff_id_fk=tbl_employee.employee_id
    LEFT JOIN tbl_department ON tbl_employee.depart_id_fk=tbl_department.department_id`;
    const fileds = `tbl_lack_work.*, 
	tbl_employee.first_name, 
	tbl_employee.last_name, 
	tbl_department.depart_name`;
    const condition = `status_del = 1 ${searchDate} ${statusOff} ${departId} ${statusLack}`;
    db.queryConditions(tables,fileds,condition, (err, results) => {
        if (err) {
            return res.status(400).send();
        }
        res.status(200).json(results);
    });
});

router.post("/status_off", function (req, res) {
    const { lack_work_id } = req.body;
 if (!lack_work_id || !Array.isArray(lack_work_id)) {
        return res.status(400).json({ error: 'Invalid lack_work_id format' });
    }
    const fields = 'status_off';
    const values = [2, lack_work_id];
    const condition = 'lack_work_id IN (?)';
    db.updateData(tables, fields, values, condition, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error deleting leave' });
        }
        res.status(200).json({ message: 'Leave created successfully', data: results });
    });
});
module.exports = router;