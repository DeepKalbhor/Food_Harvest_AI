require("dotenv").config();

const express = require("express");
const app = express();

const path = require("path");
const http = require("http");
const socketio = require("socket.io");
const mysql = require("mysql2/promise");


// ========================================
// SERVER SETUP
// ========================================

const server = http.createServer(app);
const io = socketio(server);


// ========================================
// MIDDLEWARE
// ========================================

app.set("view engine", "ejs");

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

app.use(express.json());


// ========================================
// MYSQL CONNECTION
// ========================================

const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,

    ssl: {
        ca: require("fs").readFileSync(
            path.join(__dirname, "ca.pem")
        )
    }
});


// ========================================
// TEST MYSQL CONNECTION
// ========================================

async function testDatabase() {

    try {

        const [rows] = await db.query(
            "SELECT COUNT(*) AS total FROM Orders"
        );

        console.log("MySQL connected");

        console.log(
            "Total orders:",
            rows[0].total
        );

    } catch (error) {

        console.error(
            "MySQL connection failed:",
            error.message
        );

    }

}

testDatabase();


// ========================================
// SOCKET.IO
// REAL-TIME TRACKING
// ========================================

io.on("connection", function(socket) {

    console.log(
        "User connected:",
        socket.id
    );


    // ------------------------------------
    // JOIN ORDER ROOM
    // ------------------------------------

    socket.on(
        "join-order",
        function(data) {

            const {
                orderId,
                role
            } = data;


            if (!orderId || !role) {

                return;

            }


            // Join room using order ID

            socket.join(orderId);


            // Store information on socket

            socket.orderId = orderId;

            socket.role = role;


            console.log(
                `${role} joined order ${orderId}`
            );

        }
    );


    // ------------------------------------
    // DELIVERY SENDS LOCATION
    // ------------------------------------

    socket.on(
        "send-location",
        function(data) {


            // Check order

            if (!socket.orderId) {

                return;

            }


            // Only delivery device
            // can send location

            if (socket.role !== "delivery") {

                return;

            }


            console.log(
                "Location received:",
                data.latitude,
                data.longitude
            );


            // Send location to
            // everyone in same order room

            io.to(socket.orderId).emit(
                "receive-location",
                {

                    latitude:
                        data.latitude,

                    longitude:
                        data.longitude

                }
            );

        }
    );


    // ------------------------------------
    // DISCONNECT
    // ------------------------------------

    socket.on(
        "disconnect",
        function() {

            console.log(
                "User disconnected:",
                socket.id
            );

        }
    );

});


// ========================================
// PAGE ROUTES
// ========================================


// ----------------------------------------
// HOME PAGE
// ----------------------------------------

app.get(
    "/",
    function(req, res) {

        res.render("index");

    }
);


// ----------------------------------------
// DELIVERY TRACKING PAGE
// ----------------------------------------

app.get(
    "/delivery/:orderId",
    function(req, res) {

        res.render(
            "delivery",
            {

                orderId:
                    req.params.orderId

            }
        );

    }
);


// ----------------------------------------
// NGO / CLIENT TRACKING PAGE
// ----------------------------------------

app.get(
    "/track/:orderId",
    function(req, res) {

        res.render(
            "track",
            {

                orderId:
                    req.params.orderId

            }
        );

    }
);


// ========================================
// GET EXISTING ORDER DETAILS
// ========================================

app.get(
    "/api/orders/:orderId",
    async function(req, res) {

        try {

            const orderId =
                req.params.orderId;


            console.log(
                "Searching for order:",
                orderId
            );


            const [rows] =
                await db.query(

                    `

                    SELECT

                        o.order_id,

                        o.order_status,

                        f.food_name,

                        f.quantity,

                        f.unit,

                        r.restaurant_name,

                        n.ngo_name,

                        dp.driver_id,

                        dp.vehicle_number


                    FROM Orders o


                    JOIN FoodRequests fr

                        ON o.request_id =
                           fr.request_id


                    JOIN FoodDonations f

                        ON fr.food_id =
                           f.food_id


                    JOIN Restaurants r

                        ON o.restaurant_id =
                           r.restaurant_id


                    JOIN NGOs n

                        ON o.ngo_id =
                           n.ngo_id


                    LEFT JOIN DeliveryPartners dp

                        ON o.driver_id =
                           dp.driver_id


                    WHERE o.order_id = ?

                    `,

                    [orderId]

                );


            // --------------------------------
            // ORDER NOT FOUND
            // --------------------------------

            if (rows.length === 0) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Order not found"

                });

            }


            // --------------------------------
            // SEND ORDER
            // --------------------------------

            res.json({

                success: true,

                order: rows[0]

            });


        } catch (error) {


            console.error(
                "Database error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Database error"

            });

        }

    }
);


// ========================================
// MATCHING PRINCIPLE
// ========================================
//
// Input:
//     foodId
//
// Output:
//     Best NGO
//     Existing order_id
//     Delivery URL
//     Tracking URL
//
// NO ORDER IS CREATED HERE.
// ========================================

app.post(
    "/api/matching",
    async function(req, res) {

        try {


            // --------------------------------
            // GET FOOD ID
            // --------------------------------

            const {
                foodId
            } = req.body;


            if (!foodId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "foodId is required"

                });

            }


            console.log(
                "Running matching for food:",
                foodId
            );


            // --------------------------------
            // MATCHING QUERY
            // --------------------------------

            const [rows] =
                await db.query(

                    `

                    SELECT

                        n.ngo_id,

                        n.ngo_name,

                        o.order_id,


                        (

                            LEAST(
                                f.quantity /
                                n.capacity,
                                1
                            ) * 40


                            +


                            (

                                1 /

                                (

                                    1 +

                                    (

                                        6371 * ACOS(

                                            COS(
                                                RADIANS(
                                                    f.latitude
                                                )
                                            )

                                            *

                                            COS(
                                                RADIANS(
                                                    n.latitude
                                                )
                                            )

                                            *

                                            COS(

                                                RADIANS(
                                                    n.longitude
                                                )

                                                -

                                                RADIANS(
                                                    f.longitude
                                                )

                                            )

                                            +

                                            SIN(
                                                RADIANS(
                                                    f.latitude
                                                )
                                            )

                                            *

                                            SIN(
                                                RADIANS(
                                                    n.latitude
                                                )
                                            )

                                        )

                                    )

                                )

                            ) * 60


                        ) AS MatchingScore


                    FROM FoodDonations f


                    JOIN NGOs n

                        ON n.capacity > 0


                    JOIN FoodRequests fr

                        ON fr.food_id =
                           f.food_id

                        AND fr.ngo_id =
                            n.ngo_id


                    JOIN Orders o

                        ON o.request_id =
                           fr.request_id

                        AND o.ngo_id =
                            n.ngo_id


                    WHERE f.food_id = ?

                        AND f.status =
                            'Available'

                        AND n.verification_status =
                            'Verified'

                        AND fr.status =
                            'Pending'


                    ORDER BY
                        MatchingScore DESC


                    LIMIT 1

                    `,

                    [foodId]

                );


            // --------------------------------
            // NO MATCH FOUND
            // --------------------------------

            if (rows.length === 0) {

                return res.status(404).json({

                    success: false,

                    message:
                        "No matching order found"

                });

            }


            // --------------------------------
            // GET MATCHED ORDER
            // --------------------------------

            const matchedOrder =
                rows[0];


            const orderId =
                matchedOrder.order_id;


            // --------------------------------
            // GENERATE BASE URL
            // --------------------------------

            const baseUrl =
                `${req.protocol}://${req.get("host")}`;


            // --------------------------------
            // GENERATE DELIVERY URL
            // --------------------------------

            const deliveryUrl =
                `${baseUrl}/delivery/${orderId}`;


            // --------------------------------
            // GENERATE TRACKING URL
            // --------------------------------

            const trackingUrl =
                `${baseUrl}/track/${orderId}`;


            // --------------------------------
            // SEND RESULT
            // --------------------------------

            res.json({

                success: true,

                ngoId:
                    matchedOrder.ngo_id,

                ngoName:
                    matchedOrder.ngo_name,

                orderId:
                    orderId,

                matchingScore:
                    matchedOrder.MatchingScore,

                deliveryUrl:
                    deliveryUrl,

                trackingUrl:
                    trackingUrl

            });


        } catch (error) {


            console.error(
                "Matching error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Matching failed"

            });

        }

    }
);


// ========================================
// START SERVER
// ========================================

const PORT =
    process.env.PORT || 3000;

app.get("/test-matching", async function(req, res) {
    try {
        const [rows] = await db.query("SELECT 1 AS test");

        res.send(`
            <h2>Database connection works!</h2>
            <p>Test result: ${rows[0].test}</p>
        `);

    } catch (error) {
        console.error("DATABASE TEST ERROR:", error);

        res.status(500).send(`
            <h2>Database connection failed</h2>
            <p>Code: ${error.code || "none"}</p>
            <p>Message: ${error.message || "none"}</p>
            <pre>${error.stack || ""}</pre>
        `);
    }
});


server.listen(
    PORT,
    "0.0.0.0",
    function() {

        console.log(
            `Server running on the port ${PORT}`
        );

    }
);
