const express = require('express')
const fs = require('fs')
const app = express()
const port = 3000
const ApiHelper = require('./helper')
let apiHelper = new ApiHelper.create()
const bodyParser = require('body-parser');
const CORS = require('cors');

// Initialize firebase app admin
var admin = require('firebase-admin');

var serviceAccount = require("../packalot-firebase-adminsdk-xgz4c-8620359ad5.json");

let firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://packalot.firebaseio.com"
});
let auth = firebaseApp.auth();
let firestore = firebaseApp.firestore();

// Load system configuration
let config = {}
firestore.collection("system").doc("config").get().then((snapshot) => {
    config = snapshot.data();
    console.log("System config loaded");
})

//CORS
app.use(CORS());
app.options('*', CORS());

app.use(bodyParser.json())

/**
 * @api {get} / Ping server
 * @apiName Ping Server
 * @apiGroup System
 *
 * @apiParam {Number} id Users unique ID.
 *
 * @apiSuccess {String} firstname Firstname of the User.
 * @apiSuccess {String} lastname  Lastname of the User.
 */
app.get('/', (req, res) => res.send('Hello World!'))

/**
 * @api {post} /user/create Create new user data
 * @apiName Create user data
 * @apiGroup User
 * @apiVersion  1.0.0
 * @apiParam {payload:{firstName,lastName,userName,email,password,retypePassword,phoneNumber}}
 * @apiSuccess {status,message} status:{success|failed}
 */
app.post('/user/create', async (req, res) => {
    //let payload = req.body.payload;
    console.log(req.body);

    let result = await apiHelper.validate(req.body, [
        { link: "payload/firstName" },
        { link: "payload/lastName" },
        {
            link: "payload/email", process: async (data) => {
                //Check if email is existed
                try {
                    let result = await firebaseApp.auth().getUserByEmail(data);
                    console.log(result);
                    return {
                        status: false,
                        failedMessage: data + " was registrated"
                    };
                } catch (e) { }
                return {
                    status: true
                };
            }
        },
        {
            link: "payload/password", process: (data) => {
                if (data == "" || data.length < 8) {
                    return {
                        status: false,
                        failedMessage: "Password is invalid"
                    };
                }
                return {
                    status: true
                };
            }
        },
        {
            link: "payload/retypePassword", process: (data) => {

                if (req.body.payload.password != data) {
                    return {
                        status: false,
                        failedMessage: "Retype password is not match"
                    }
                }
                return { status: true };
            }
        },
        { link: "payload/phoneNumber" }
    ]);
    if (result.status) {
        try {
            // Create with Auth
            let usr = await auth.createUser({
                displayName: req.body.payload.firstName + " " + req.body.payload.lastName,
                email: req.body.payload.email,
                password: req.body.payload.password,
                phoneNumber: req.body.payload.phoneNumber
            });
            try {
                // Create new record in db
                await firestore.collection("users").doc(usr.uid).set({
                    packSize: config.defaultSize,
                    usage: 0
                });

                await firestore.collection("users").doc(usr.uid).collection("warehouse").doc().set({});

                res.send({
                    status: "success",
                    message: "Create user successful"
                });
            }
            catch{
                res.send({
                    status: "failed",
                    message: "Try again later"
                });
            }
        }
        catch (e) {
            res.send({
                status: "failed",
                message: e
            });
        }
    }
    else {
        res.send({
            status: "failed",
            message: result.message
        });
    }
});

/**
 * 
 * @api {post} /user/get Get user data
 * @apiName GetUser
 * @apiGroup User
 * @apiVersion  1.0.0
 * 
 * 
 * @apiParam  {String} uid Logged-in user id
 * 
 * @apiSuccess (200) {type} name description
 * 
 * @apiParamExample  {type} Request-Example:
 * {
 *      token:xxxx.....
 *      uid : abcxyz...
 * }
 * 
 * 
 * @apiSuccessExample {type} Success-Response:
 * {
 *     status : success
 *     message: Get user data success
 * }
 * 
 * 
 */
app.post("/user/get", async (req, res) => {
    console.log(req.body);
    let result = await apiHelper.validate(req.body, [
        { link: "token" },
        {
            link: "uid", process: async (data) => {
                try {
                    let authResult = await checkAuth(data, req.body.token);
                    console.log(authResult);
                    if (authResult != null) {
                        console.log(data)
                        console.log(req.body.token);
                        let docRef = await firestore.collection("users").doc(data).get();
                        if (docRef.data() == undefined) {
                            return {
                                status: false,
                                failedMessage: "User did not exist"
                            };
                        }
                        return {
                            status: true
                        };
                    }
                    return {
                        status: false,
                        failedMessage: "Permission denied"
                    }
                }
                catch{
                    return {
                        status: false,
                        failedMessage: "Error"
                    };
                }
            }
        }
    ]);
    if (result.status) {
        let data = (await firestore.collection("users").doc(req.body.uid).get()).data();
        let used = (await getDirectorySize("./warehouse/" + req.body.uid));
        res.send({
            status: "success",
            payload: {
                ...data,
                used: used
            }
        });
    }
    else {
        res.send({
            status: "failed",
            message: result.message
        });
    }
});

// Check if user was authenticated
async function checkAuth(uid, token) {
    try {
        let decodedIdToken = await auth.verifyIdToken(token);
        return uid == decodedIdToken.uid;
    }
    catch {
        return null;
    }
}

//Get size of directory
async function getDirectorySize(root) {
    let size = 0;
    try {
        let files = await fs.readdirSync(root);
        for (let i = 0; i < files.length; i++) {
            let stats = await fs.statSync(root + "/" + files[i]);
            size += stats.size;
            size += await getDirectorySize(root + "/" + files[i]);
        }
        return size;
    }
    catch{
        return 0;
    }
}

/**
 * 
 * @api {post} /user/browser Browse files and folders
 * @apiName browseFile
 * @apiGroup Warehouse
 * @apiVersion  1.0.0
 * 
 * 
 * @apiParam {String} uid User id
 * @apiParam {String} dir directory
 * 
 * @apiSuccess (200) {type} name description
 * 
 * @apiParamExample  {type} Request-Example:
 * {
 *      uid:abcxyz...,
 *      token:xxxx...
 *      dir:"/"
 * }
 * 
 * 
 * @apiSuccessExample {type} Success-Response:
 * {
 *      files:[
 *          {fileName:"abc.xyz",uploadDate:"1/1/2019",size:204800}
 *      ] //list of file
 *      folders:[
 *          {}
 *      ] //list of folder
 * }
 * 
 * 
 */
app.post("/user/browse", async (req, res) => {
    let result = await apiHelper.validate(req.body, [
        { link: "uid" },
        {
            link: "token", process: async (token) => {
                let isAuth = await checkAuth(req.body.uid, token);
                if (isAuth != null && isAuth == true) {
                    return { status: true };
                }
                else {
                    return {
                        status: false,
                        failedMessage: "Permission denied"
                    }
                }
            }

        }, { link: "dir" }
    ]);
    if (result.status) {
        try {
            let isExisted = await fs.existsSync("./warehouse/" + req.body.uid);
            console.log(isExisted);
            if (!(await fs.existsSync("./warehouse/" + req.body.uid))) {
                await fs.mkdirSync("./warehouse/" + req.body.uid);
                throw "Create new warehouse";
            }
            else {
                let dirItems = await fs.readdirSync("./warehouse/" + req.body.uid + req.body.dir);
                let folders = [];
                let files = [];
                for (let i = 0; i < dirItems.length; i++) {
                    let isDirectory = await fs.statSync("./warehouse/" + req.body.uid + req.body.dir + dirItems[i]).isDirectory();
                    if (isDirectory) {
                        folders.push(dirItems[i]);
                    }
                    else {
                        files.push(dirItems[i]);
                    }
                }
                res.send({
                    status: "success",
                    files: files,
                    folders: folders
                });
            }
        }
        catch (e) {
            res.send({ status: "failed", message: e });
        }
    }
    else {
        res.send({ status: "failed", message: result.message });
    }
});

app.listen(port, () => console.log(`Running on port ${port}!`))