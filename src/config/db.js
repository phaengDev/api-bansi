const mysql = require('mysql2');
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'bansi'
});


const autoId = (table, fields, callback) => {
    const maxId = new Date().getFullYear() + '001';
    connection.query(`SELECT MAX(${fields}) + 1 AS maxid FROM ${table}`, (err, results, fields) => {
        if (err) {
            console.error('Error selecting data:', err);
            return callback(err, null);
        }
        let generatedId = maxId; 
        if (results.length > 0 && results[0].maxid !== null) {
            generatedId = results[0].maxid.toString();
        }
        callback(null, generatedId);
    });
};


const queryMax = (table, fields, wheres, maxId, callback) => {
    connection.query(`SELECT MAX(${fields}) + 1 AS maxcode FROM ${table} WHERE ${wheres}`, (err, results, fields) => {
        if (err) {
            console.error('Error selecting data:', err);
            return callback(err, null);
        }
        let generatedId = maxId+'1'; 
        if (results.length > 0 && results[0].maxcode !== null) {
            generatedId = results[0].maxcode.toString();
        }
        callback(null, generatedId);
    });
};

const insertData = (table, fields, data, callback) => {
    const placeholders = new Array(data.length).fill('?').join(', ');
    const query = `INSERT INTO ${table} (${fields}) VALUES (${placeholders})`;
    connection.query(query, data, (err, results, fields) => {
        if (err) {
            console.error('Error inserting data:', err);
            return callback(err, null);
        }
        callback(null, results);
    });
};

const updateData = (table, field, data, condition, callback) => {
    // const placeholders = new Array(data.length).fill('?').join(', ');
    const setFields = field.split(',').map(field => `${field} = ?`).join(', ');
    const query = `UPDATE ${table} SET ${setFields} WHERE ${condition}`;
    connection.query(query, data, (err, results) => {
        if (err) {
            console.error('Error updating data:', err);
            return callback(err, null);
        }
        callback(null, results);
    });
};


const deleteData = (table, where, callback) => {
    connection.query(`DELETE FROM ${table} WHERE ${where}`, (err, results) => {
        if (err) {
            console.error('Error delete data:', err);
            return callback(err, null);
        }
        callback(null, results);
    });
};

const queryAll = (table, callback) => {
    connection.query(`SELECT * FROM ${table}`, (err, results, fields) => {
        if (err) {
            console.error('Error selecting data:', err);
            return callback(err, null);
        }
        callback(null, results);
    });
};


const queryData = (table,where, callback) => {
    connection.query(`SELECT * FROM ${table} WHERE ${where}`, (err, results, fields) => {
        if (err) {
            console.error('Error selecting data:', err);
            return callback(err, null);
        }
        callback(null, results);
    });
};

const queryField = (table, fields, callback) => {
    connection.query(`SELECT ${fields} FROM ${table}`, (err, results) => {
        if (err) {
            console.error('Error selecting data:', err);
            return callback(err, null);
        }
        callback(null, results);
    });
};

const queryConditions = (table, fields, where,  callback) => {
    connection.query(`SELECT ${fields} FROM ${table} WHERE ${where}`, (err, results) => {
        if (err) {
            console.error('Error selecting data:', err);
            return callback(err, null);
        }
        callback(null, results);
    });
};


const fetchSingleAll = (table, where,  callback) => {
    connection.query(`SELECT * FROM ${table} WHERE ${where}`, (err, results, fields) => {
        if (err) {
            console.error('Error selecting data:', err);
            return callback(err, null);
        }
        callback(null, results[0]);
    });
};

const fetchSingle = (table, fields, where,  callback) => {
    const query = `SELECT ${fields} FROM ${table} WHERE ${where} LIMIT 1`;
    connection.query(query, (err, results) => {
        if (err) {
            console.error('Error selecting data:', err);
            return callback(err, null);
        }
        callback(null, results[0]);
    });
};


module.exports = {
    autoId,
    queryMax,
    insertData,
    updateData,
    deleteData,
    queryAll,
    queryData,
    queryField,
    queryConditions,
    fetchSingleAll,
    fetchSingle
};
