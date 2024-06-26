import express from "express";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import path from "path";
import {engine} from 'express-handlebars';

import https from 'https';
import fs from 'fs';

import * as SQLQueries from './SQLQueries.js';
import * as dataManipulations from './dataManipulations.js'

const pages = ['actions', 'locations', 'plants', 'sensor_readings', 'sensors', 'updates', 'light_categories', 'action_types'];
let testData = {};
let fkResults = {};

export async function runServer() {
    dotenv.config();

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    // This just uses the stuff we got once
    // In the future, we will need to fetch dynamically with every request
    for (const page of pages) {
        // Fetch table schema
        const [schemaResult] = await connection.execute(`DESCRIBE ${page}`);
        // Build schema as object (for help with forms)
        const schemaFields = Object.fromEntries(schemaResult.map(row => [row.Field, null]));

        // Get FK relationships from table
            // Yields eg
            //  [
            //    {
            //      COLUMN_NAME: 'plants_plant_id',
            //      REFERENCED_TABLE_NAME: 'plants',
            //      REFERENCED_COLUMN_NAME: 'plant_id'
            //    }
            //  ]
        // Derived from:
            // https://stackoverflow.com/questions/201621/how-do-i-see-all-foreign-keys-to-a-table-or-column
        // 5/16/2024
        const [fkResult] = await connection.execute(`
            SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
            WHERE TABLE_NAME = ?
            AND REFERENCED_TABLE_NAME IS NOT NULL
            `, [page]);

        //foreign keys will not be mutable on the user end, so there's no need to re-calculate them after this first time.
        fkResults[page] = fkResult;

        // Fill FK fields with names for CRUD menus
        for (const fk of fkResult) {
             // Get list of names
            const [names] = await connection.execute(`SELECT NAME FROM ${fk.REFERENCED_TABLE_NAME};`);
            schemaFields[fk.COLUMN_NAME] = names.map(row => row.NAME);
        }

        const fullQuery = SQLQueries.GetFullDataTableQuery(page,fkResult);
        // Fetch table data with the constructed query
        const [dataResult] = await connection.execute(fullQuery);

        testData[page] = [schemaFields, ...dataResult];
    }
    const primaryKeys = await connection.execute(SQLQueries.GetPrimaryKeysQuery());
    const primaryKeyDictionary = dataManipulations.GetPrimaryKeyDictionary(primaryKeys);

    const app = express();
    app.engine('handlebars', engine({ defaultLayout: 'main' }));
    app.set('view engine', 'handlebars');

    app.use(express.static('frontend'));
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }))

    pages.forEach(page => {
        app.get(`/${page}`, async (req, res) => {
            const fullQuery = SQLQueries.GetFullDataTableQuery(page, fkResults[page]);
            const [dataResult] = await connection.execute(fullQuery);
            testData[page] = [...dataResult];
            let pickerOptions = {};
            pickerOptions.plantPickerOptions = dataManipulations.GetFKDictionary(testData, `plants`, `plant_id`,`name`);
            pickerOptions.sensorPickerOptions = dataManipulations.GetFKDictionary(testData, `sensors`, `sensor_id`, `name`);
            pickerOptions.locationPickerOptions = dataManipulations.GetFKDictionary(testData, `locations`, `location_id`, `name`);
            pickerOptions.lightCategoriesPickerOptions = dataManipulations.GetFKDictionary(testData,`light_categories`, `category_id`, `name`);
            pickerOptions.actionTypesPickerOptions = dataManipulations.GetFKDictionary(testData,`action_types`, `action_type_id`, `name`);
            
            // Render the corresponding Handlebars template
            res.render(page, {title: dataManipulations.GetPageTitle(page), entries: testData[page], pages: pages, pickerOptions: pickerOptions });

        });
        app.post(`/${page}/create`, async (req, res) =>
            {
                const obj = JSON.parse(JSON.stringify(req.body));
               
                if(req.body !== null)
                {
                    const queryString = SQLQueries.InsertQueryString(page, obj);
                    await connection.execute(queryString);
                    res.redirect(req.get('referer'));
                }
                else{
                    res.status(401).send("Please check your stuff.");
                }
            }
            );
        
        app.post(`/${page}/update`, async (req, res) =>
            {
                const obj = JSON.parse(JSON.stringify(req.body));
                if(req.body !== null)
                    {
                        const primaryKey = primaryKeyDictionary[page];
                        const queryString = SQLQueries.UpdateQueryString(page, obj, primaryKey);
   
                        await connection.query(queryString);
 
                        res.redirect(req.get('referer'));
                    }
                    else{
                        res.status(401).send("Please check your stuff.");
                    }
            }
        );
        app.post(`/${page}/delete`, async (req, res) =>
            {
                const obj = JSON.parse(JSON.stringify(req.body));
                if(req.body !== null)
                    {
                        const primaryKey = primaryKeyDictionary[page];
                        const queryString = SQLQueries.DeleteQueryString(page, obj, primaryKey);
                        await connection.execute(queryString);
                        res.redirect(req.get('referer'));
                    }
                    else{
                        res.status(401).send("Please check your stuff.");
                    }
            }
        );

    });
    // Define routes
    app.get('/', (req, res) => {
        res.render('index', {
            title: 'Plant Friend',
            pages: pages
        });
    });
    
    

    if (process.env.IS_PROD === "true") {
        if (typeof process.env.CERT_PATH === 'undefined') {
            throw new Error('CERT_PATH environment variable is not set.');
        }
        const privateKey = fs.readFileSync(path.join(process.env.CERT_PATH, "privkey.pem"), "utf8");
        const certificate = fs.readFileSync(path.join(process.env.CERT_PATH, "fullchain.pem"), "utf8");


        const credentials = { key: privateKey, cert: certificate };


        const httpsServer = https.createServer(credentials, app);


        httpsServer.listen(443, () => {
            console.log('HTTPS server running on port 443');
        });
        // redirect HTTP server
        const httpApp = express();
        httpApp.all('*', (req, res) => res.redirect(['https://', req.get('Host'), req.url].join('')));
        httpApp.listen(80, () => console.log(`HTTP redirect server listening`));
    } else { // Dev server
        app.listen(process.env.PORT_NUMBER, () => {
            console.log(`HTTP server running on port ${process.env.PORT_NUMBER}`);
        });
    }
}


