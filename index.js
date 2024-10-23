const express = require('express')
const app = express()
const cors = require("cors");
const bodyParser = require('body-parser');
app.use(express.json());
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
const path = require("path")
app.use("/image", express.static(path.join(__dirname, "./image/")))
const login = require('./src/config/login')
const type = require('./src/setting/api-type-acount');
const province = require('./src/setting/api-province');
const district = require('./src/setting/api-district');
const department = require('./src/setting/api-department');
const rights = require('./src/setting/api-rights');
const employee = require('./src/action/api-employee');

// ====================================
app.use('/login', login);
app.use('/type', type);
app.use('/province', province);
app.use('/district', district);
app.use('/depart', department);
app.use('/rights', rights);
app.use('/staff', employee);
const PORT = process.env.PORT || 5450;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});