var base62       = require('base62');
var bodyParser   = require('body-parser');
var express      = require('express');
var moment       = require('moment');
var mysql        = require('mysql');
var normalizeUrl = require('normalize-url');
var validator    = require('validator');

var config       = require('./config.json');
var port         = process.env.port || 8080;

/* initialize mysql connection */
var conn = mysql.createConnection({
    socketPath : config['mysql']['socket'],
    user       : config['mysql']['username'],
    password   : config['mysql']['password'],
    database   : config['mysql']['database']
});
conn.connect();

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
        conn.query("SELECT longurl, status FROM urls WHERE id = ?", [id], function(err, result) {
            if(err) res.status(500).send("Something went wrong...");
            if (result.length > 0) {
                res.json({
                    "kind": "urlshortener#url",
                    "id": config["siteurl"] + param,
                    "longUrl": result[0].longurl,
                    "status":  result[0].status,
                });
            } else {
                res.status(404).send("D.N.E");
            }
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
            conn.query("SELECT id FROM urls WHERE longurl = ?", [longurl], function(err, result) {
                if(err) res.status(500).send("Something went wrong...");                
                if(!result.length && !err) {
                    conn.query("INSERT INTO urls (longurl, created) VALUES (?, ?)", [longurl, time], function(err, result) {
                        if(err) res.status(500).send("Something went wrong...");
                        res.json({
                            "kind": "urlshortener#url",
                            "id": config["siteurl"] + base62.encode(result.insertId),
                            "longUrl": longurl
                        });
                    });
                }
                else {
                    res.json({
                        "kind": "urlshortener#url",
                        "id": config["siteurl"] + base62.encode(result[0].id),
                        "longUrl": longurl
                    });
                }
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
        
        conn.query("UPDATE urls SET clicks = clicks + 1 WHERE id = ?", [id], function(err, result) {
            if(err) res.status(500).send("Something went wrong...");
            if(result.changedRows > 0) {        
                conn.query("SELECT longurl,status FROM urls WHERE id = ?", [id], function(err, result) {
                    if(err) res.status(500).send("Something went wrong...");
                    if (result.length > 0) {
                        if(result[0].status === 'OK') {
                            res.json({
                                "kind": "urlshortener#url",
                                "id": realId,
                                "longUrl": result[0].longurl,
                                "status":  "OK",
                            });
                        } else {
                            res.status(404).send("D.N.E");
                        } 
                    }
                });
            } else {
                res.status(404).send("D.N.E");    
            }
        });
    }) /* End PUT */

/* setup and run app */
var app = express();
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use("/url", router);
app.listen(port);