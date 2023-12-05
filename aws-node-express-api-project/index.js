const serverless = require("serverless-http");
const express = require('express');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
require('dotenv').config();

const app = express();
app.use(express.json());
const mysql = require('mysql2');

const pool = mysql.createPool({
  host:  process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE
});



const s3 = new AWS.S3();

const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } }); // 10MB file size limit

// Test database connection
pool.getConnection((err, connection) => {
  if (err) throw err;
  console.log("Connected to database!");
  connection.release();
});

app.get('/', (req, res) => {
  res.send("hello");
});




app.post('/upload', upload.single('file'), function (req, res) {
  const file = req.file.buffer; // File buffer from multer
  const s3Key = uuidv4(); // Randomly generated file key
  const {caption, event_code} = req.body;
  
  

  const params = {
    Bucket: process.env.BUCKET_NAME,
    Key: s3Key,
    Body: file, // File buffer used here
    ContentType: file.mimetype, // Set appropriate content type
  };

  s3.upload(params, function (err, data) {
    if (err) {
      return res.status(500).send(err);
    }


    let url = data.Location;
    const query = 'INSERT INTO post (event_code, s3_image_url, caption) VALUES (?, ?, ?)';
    pool.query(query, [event_code, url, caption], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).send({ message: 'Error inserting event into database' });
      }else{
        res.status(200).send({
          message: "File uploaded successfully",
          data: data,
        });
      }
    });
  });
});


app.post('/event', (req, res) => {
  // Directly destructure event_code from req.body
  const { event_code } = req.body;

  // Generate the current date-time and expiry date-time (24 hours from now)
  const event_date = new Date().toISOString(); // Current date-time in ISO format
  const expiry_date = new Date(new Date().getTime() + (24 * 60 * 60 * 1000)).toISOString(); // 24 hours from now in ISO format

  // Check if all necessary data is provided
  if (!event_code) {
    return res.status(400).send({ message: 'Missing required event field: event_code' });
  }

  // Prepare SQL query to insert the new event
  const query = 'INSERT INTO event (event_code, event_date, expiry_date) VALUES (?, ?, ?)';

  // Execute the query
  pool.query(query, [event_code, event_date, expiry_date], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send({ message: 'Error inserting event into database' });
    }
    res.status(201).send({ message: 'Event created successfully', eventId: result.insertId });
  });
});

app.get('/post/:eventCode', (req, res) => {
  const eventCode = req.params.eventCode;

  if (!eventCode) {
    return res.status(400).send({ message: 'Missing required parameter: eventCode' });
  }

  const query = 'SELECT * FROM post WHERE event_code = ?';

  pool.query(query, [eventCode], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send({ message: 'Error fetching posts from database' });
    }
    if (results.length === 0) {
      return res.status(404).send({ message: 'No posts found for this event code' });
    }
    res.status(200).send(results);
  });
});





module.exports.handler = serverless(app);

