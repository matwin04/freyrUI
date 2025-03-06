document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("downloadForm");
    const downloadStatus = document.getElementById("downloadStatus");

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const url = document.getElementById("urlInput").value;

        // Send URL to the backend for processing
        fetch("/download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                downloadStatus.innerHTML = `<p style="color: green;">Download started!</p>`;
            } else {
                downloadStatus.innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
            }
        })
        .catch(error => {
            downloadStatus.innerHTML = `<p style="color: red;">Request failed.</p>`;
            console.error("Error:", error);
        });
    });
});