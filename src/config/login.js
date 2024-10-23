const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const db = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const moment = require('moment');
const currentDatetime = moment();
const dateTime = currentDatetime.format('YYYY-MM-DD HH:mm:ss');
const secret = 'bansi-plc-2024'; // Replace with your actual secret key
const jsonParser = bodyParser.json();

router.post("/check", function(req, res) {
    const table = `tbl_users
	LEFT JOIN tbl_rights_use ON  tbl_users.rightsUse = tbl_rights_use.rightsId
    LEFT JOIN tbl_employee ON tbl_users.employee_id_fk = tbl_employee.employee_id
	LEFT JOIN tbl_department ON tbl_employee.depart_id_fk = tbl_department.department_id`; 
    const userPassword = req.body.userPassword; 
    const userEmail = req.body.userEmail;
    const fields = `tbl_rights_use.rightsName, 
	tbl_rights_use.inserts, 
	tbl_rights_use.edits, 
	tbl_rights_use.deletes, 
	tbl_rights_use.status_ck, 
	tbl_users.userId, 
	tbl_users.employee_id_fk, 
	tbl_users.userName, 
	tbl_users.userEmail, 
	tbl_users.userPassword,
    tbl_employee.profile, 
	tbl_department.depart_name`; 
    const where = `userEmail = '${userEmail}' AND statusUse='1'`; 
    db.queryConditions(table, fields, where, (err, results) => {
        if (err) {
            return res.status(400)
            .json({
                status: "400",
                message: "ຊື່ອີເມວບໍ່ຖືກຕ້ອງ"
            });
        }
        bcrypt.compare(userPassword, results[0].userPassword, (bcryptErr, bcryptResult) => {
            if (bcryptErr || !bcryptResult) {
                return res.status(400)
                .json({
                    status: "400",
                    message: "ຫັດຜ່ານບໍ່ຖືກຕ້ອງ"
                });
            }
            // Sign a new JWT token
            const payload = {
                userId: results[0].userId,
                userEmail: results[0].userEmail,
                dateLogin: dateTime
            };
            jwt.sign(payload, secret,{ expiresIn: '12h' }, (signErr, token) => {
                if (signErr) {
                    return res.status(500).json({
                        status: "500",
                        message: "ເຊີບເວີພາຍໃນມີການຜິດພາດ"
                    });
                }
                res.status(200).json({
                    status: "200",
                    message: "ການເຂົ້າສູ້ລະບົບໄດສຳເລັດແລ້ວ",
                    token: token,
                    userid: results[0].userId,
                    useremail: results[0].userEmail,
                    username: results[0].userName,
                    employee_id: results[0].employee_id_fk,
                    inserts:results[0].inserts,
                    edits:results[0].edits,
                    deletes:results[0].deletes,
                    profile:results[0].profile,
                    departName:results[0].depart_name,
                });
            });
        });
    });
});


router.post("/authen", jsonParser, function (req, res) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ status: '401', message: 'ບໍ່ໄດ້ຮັບອະນຸຍາດ:: Token missing' });
    }
    try {
        const token = authHeader.split(' ')[1]; // Extract the token
        const decoded = jwt.verify(token, secret); // Verify the token
        res.status(200).json({ status: '200', decoded });
    } catch (err) {
        return res.status(401).json({ status: '401', message: 'ບໍ່ໄດ້ຮັບອະນຸຍາດ: token ບໍ່ຖືກຕ້ອງ ຫຼືໝົດອາຍຸ' });
    }
});


// router.post("/authen", jsonParser,function(req, res) {
//     try{
//         const token=req.headers.authorization.split(' ')[1]
//         const decoded=jwt.verify(token, secret)
//         res.json({status:'200', decoded})
//     }catch(err){
//         res.json({status:'500', message:err.message})
//     }
// });

module.exports=router