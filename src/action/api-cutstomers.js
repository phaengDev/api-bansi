const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const { unlink } = require('fs');
const currentDatetime = moment();
const dateTime = currentDatetime.format('YYYY-MM-DD HH:mm:ss');
const tables = `tbl_customers`;
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'image/logo'); 
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, 'ct-' + Date.now() + ext); 
    },
});
const upload = multer({ storage });
router.post("/create", upload.single('profileImage'), (req, res) => {

    const profileImage = req.file ? req.file.filename : null;
    const { customerId, customerName, customerPhone, customerEmail, district_id_fk, customerVillage, customerType, customerRemark,profileck } = req.body;
    if (!customerId) {
        const fields = 'customerId, customerCode, profileImage, customerName, customerPhone, customerEmail, district_id_fk, customerVillage, customerType, customerRemark, statusUse, createDate';
        const fieldNumber = `COALESCE(
        CONCAT('CTM-', RIGHT(YEAR(CURDATE()), 2), '/', LPAD(SUBSTRING(MAX(customerCode), 8) + 1, 3, '00')),
        CONCAT('CTM-', RIGHT(YEAR(CURDATE()), 2), '/001')
        ) AS customerCode`;
        const wheres = `customerCode LIKE CONCAT('CTM-', RIGHT(YEAR(CURDATE()), 2), '/%');`;
        db.queryConditions(tables, fieldNumber, wheres, (err, resp) => {
            const customerCode = resp[0].customerCode;
            const data = [uuidv4(), customerCode, profileImage, customerName, customerPhone, customerEmail, district_id_fk, customerVillage, customerType, customerRemark, 1, dateTime];
            db.insertData(tables, fields, data, (err, resp) => {
                if (err) {
                    return res.status(500).json({ error: 'Error creating expenditure' });
                }
                res.status(200).json({ message: 'Expenditure created successfully', data: resp });
            });
        });
    } else {
        if (profileck && profileImage) {
            const filePath = path.join('image/document',profileck);
            fs.unlink(filePath, (err) => {
                if (err) {
                  console.error('Error deleting file:', err);
                }
              });
        }else{
            profileImage = profileck;
        }
        const dataedit = [profileImage,customerName, customerPhone, customerEmail, district_id_fk, customerVillage, customerType, customerRemark, customerId];
        const fields = `profileImage, customerName, customerPhone, customerEmail, district_id_fk, customerVillage, customerType, customerRemark`;
        const condition = 'customerId=?';
        db.updateData(tables, fields, dataedit, condition, (err, results) => {
            if (err) {
                return res.status(500).json({ error: 'Error creating expenditure' });
            }
            res.status(200).json({ message: 'Expenditure created successfully' , data: results});
        });
    }
});

module.exports = router;