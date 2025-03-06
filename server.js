require("dotenv").config();
const express = require("express");
const { engine } = require("express-handlebars");
const path = require("path");
const { exec } = require("child_process");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
//Express Consts
const app = express();
const PORT = process.env.PORT || 3000;
const MEDIA_DIR = path.join(__dirname,"/media");

// Ensure media folder exists
if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR);
    console.log("Creating /media");
}
console.log("/media allready exists");

//Setup SQLite DB
const db = new sqlite3.Database("media.db",(err)=>{
    if (err) {
        console.error("Error Opening DB:",err.message);
    } else {
        console.log("Connected to SQLite DB: ");
        db.run(
            `CREATE TABLE IF NOT EXISTS songs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                album TEXT NOT NULL,
                filename TEXT,
                year TEXT,
                download_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`
        );
    }
});

//Middleware
app.engine("html", engine({ 
    extname: ".html", 
    defaultLayout: false,
    partialsDir: path.join(__dirname, "views/partials") 
}));
app.set("view engine", "html");
app.set("views", path.join(__dirname, "views"));

//Json
app.use(express.json());

//Static Routes
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/media", express.static(MEDIA_DIR));

// Define Routes
app.get("/", (req, res) => res.render("index"));
app.get("/settings", (req, res) => res.render("settings"));
app.get("/media", (req, res) => {
    db.all("SELECT * FROM songs ORDER BY download_date DESC", [], (err, rows) => {
        if (err) {
            console.error("Database Error:", err.message);
            return res.status(500).send("Database error.");
        }
        res.render("media", { songs: rows });
    });
});
// Handle song download request
app.post("/download", (req, res) => {
    const url = req.body.url;

    if (!url) {
        return res.json({ success: false, error: "No URL provided" });
    }

    console.log(`Downloading song from URL: ${url}`);

    const command = `freyr -d "${MEDIA_DIR}" "${url}"`;
    //Execute Freyr Download
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Freyr Error: ${error.message}`);
            return res.json({ success: false, error: error.message });
        }

        console.log(`✅ Freyr Output:\n${stdout}`);
        console.error(`⚠️ Freyr Errors:\n${stderr}`);

        // Extract metadata from stdout
        const titleMatch = stdout.match(/➤ Title: (.+)/);
        const albumMatch = stdout.match(/➤ Album: (.+)/);
        const artistMatch = stdout.match(/➤ Artist: (.+)/);
        const yearMatch = stdout.match(/➤ Year: (\d{4})/);
        const outputDirMatch = stdout.match(/Output directory: \[(.+)\]/);

        if (!titleMatch || !artistMatch || !albumMatch || !outputDirMatch) {
            console.warn("⚠️ Metadata extraction failed. Writing to log file.");
            const logFile = path.join(__dirname, "freyr_output.log");
            fs.writeFileSync(logFile, stdout);

            return res.json({ success: false, error: "Metadata extraction failed. Check freyr_output.log." });
        }

        const title = titleMatch[1].trim();
        const album = albumMatch[1].trim();
        const artist = artistMatch[1].trim();
        const year = yearMatch ? yearMatch[1].trim() : "Unknown Year";
        const outputDir = outputDirMatch[1].trim();

        console.log(`📝 Metadata extracted:\n  🎵 Title: ${title}\n  💿 Album: ${album}\n  🎤 Artist: ${artist}\n  📅 Year: ${year}`);

        // Insert metadata into database (filename will be updated later)
        db.run(
            `INSERT INTO songs (title, artist, album, filename, download_date) VALUES (?, ?, ?, NULL, datetime('now'))`,
            [title, artist, album],
            function (err) {
                if (err) {
                    console.error("❌ Database Error:", err.message);
                    return res.json({ success: false, error: err.message });
                }
                console.log(`📝 Metadata added to database: "${title}" by ${artist}`);
                // Wait and locate the downloaded file
                setTimeout(() => {
                    const artistDir = path.join(outputDir, artist);
                    const albumDir = path.join(artistDir, album);
                    try {
                        const files = fs.readdirSync(albumDir).filter(file => file.endsWith(".m4a") || file.endsWith(".mp3") || file.endsWith(".flac"));
                        if (files.length === 0) {
                            console.error("❌ No audio file found.");
                            return;
                        }
                        const filename = files[0]; // Assume first found audio file
                        const filePath = path.join(albumDir, filename);
                        // Update the database with the filename
                        db.run(
                            `UPDATE songs SET filename = ? WHERE title = ? AND artist = ? AND album = ?`,
                            [filename, title, artist, album],
                            function (err) {
                                if (err) {
                                    console.error("❌ Database Update Error:", err.message);
                                } else {
                                    console.log(`✅ File "${filename}" linked to "${title}" in DB.`);
                                }
                            }
                        );
                    } catch (err) {
                        console.error("❌ File search error:", err.message);
                    }
                }, 5000); // Give time for Freyr to complete download

                res.json({ success: true, title, artist, album });
            }
        );
    });
});

// Start the Express server and store the instance
const server = app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

// Handle shutdown properly
function shutdown() {
    console.log("Shutting down server...");
    server.close(() => {
        console.log("Server closed.");
        process.exit(0);
    });
}

// Handle manual termination (Ctrl+C)
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Allow Electron to trigger shutdown remotely
process.on("message", (msg) => {
    if (msg === "shutdown") {
        shutdown();
    }
});