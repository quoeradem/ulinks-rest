var base62       = require('base62');
var bodyParser   = require('body-parser');
var express      = require('express');
var moment       = require('moment');
var mysql        = require('promise-mysql');
var normalizeUrl = require('normalize-url');
var validator    = require('validator');

var config       = require('./config.json');
var port         = process.env.port || 8080;

/* initialize mysql connection */
var pool = mysql.createPool({
    socketPath : config['mysql']['socket'],
    user       : config['mysql']['username'],
    password   : config['mysql']['password'],
    database   : config['mysql']['database'],
    connectionLimit: 100
});

/* setup routes */
var router = express.Router();
router.route('/')
    .get(function(req, res) {
        var qp = String(req.query.shortUrl);
        
        if(qp.indexOf(config["siteurl"]) > -1)
            var param = qp.replace(config["siteurl"], "");
        else
            res.status(400).send("Not a valid short URL m8"); 

        var id = base62.decode(param);
        pool.getConnection().then(function(conn) {
            conn.query("SELECT longurl, status FROM urls WHERE id = ?", [id]).then(function(rows) {
                conn.release;
                res.json({
                    "kind": "urlshortener#url",
                    "id": config["siteurl"] + param,
                    "longUrl": rows[0].longurl,
                    "status":  rows[0].status,
                });
            }).catch(function(err) {
                conn.release;
                res.status(404).send("D.N.E");
            });
        }).catch(function(err) {
            res.status(500).send("Something went wrong...");
        });
    }) /* End GET */
    .post(function(req, res) {
        var longurl = String(req.body.longUrl);        
        var time = moment().toISOString();
        
        /* Set headers to allow POST request from frontend */
        res.setHeader('Access-Control-Allow-Origin', validator.rtrim(config["siteurl"], '/'));
        res.setHeader('Access-Control-Allow-Methods', 'POST');
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

        if(!validator.isURL(longurl) || longurl.indexOf(config["siteurl"]) > -1) {
            res.status(400).send("Not a valid long URL m8");
        }
        else {
            longurl = normalizeUrl(longurl);
            pool.getConnection().then(function(conn) {
                conn.query("SELECT id FROM urls WHERE longurl = ?", [longurl]).then(function(rows) {
                    return rows.length ? rows : conn.query("INSERT INTO urls (longurl, created) VALUES (?, ?)", [longurl, time]);
                }).then(function(rows) {
                    conn.release;
                    var id = rows.length ? rows[0].id : rows.insertId;
                    res.json({
                        "kind": "urlshortener#url",
                        "id": config["siteurl"] + base62.encode(id),
                        "longUrl": longurl
                    });
                });
            }).catch(function(err) {
                conn.release;
                res.status(500).send("Something went wrong...");
            });
        }
    }) /* End POST */
    .put(function(req, res) {
        var realId = String(req.body.id);
                
        if(realId.indexOf(config["siteurl"]) > -1)
            var param = realId.replace(config["siteurl"], "");
        else
            res.status(400).send("Not a valid short url m8"); 

        var id = base62.decode(param);

        /* Set headers to allow PUT request from frontend */
        res.setHeader('Access-Control-Allow-Origin', validator.rtrim(config["siteurl"], '/'));
        res.setHeader('Access-Control-Allow-Methods', 'PUT');
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
        
        pool.getConnection().then(function(conn) {
            conn.query("UPDATE urls SET clicks = clicks + 1 WHERE id = ?", [id]).then(function(rows) {
                return conn.query("SELECT longurl,status FROM urls WHERE id = ?", [id]);
            }).then(function(rows) {
                conn.release;
                if(rows[0].status === 'OK') {
                    res.json({
                        "kind": "urlshortener#url",
                        "id": realId,
                        "longUrl": rows[0].longurl,
                        "status":  "OK",
                    });
                } else {
                    res.status(404).send("Looks like a bad URL :/");
                }
            }).catch(function(err) {
                conn.release;
                res.status(404).send("D.N.E");
            });
        }).catch(function(err) {
            res.status(500).send("Something went wrong...");
        });
    }) /* End PUT */

/* setup and run app */
var app = express();
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use("/url", router);
app.listen(port);