import { jsx as _jsx, jsxs as _jsxs } from "src/lib/jsx-runtime";
import { DefineRoom } from "./components/DefineRoom.js";
export class App {
    constructor() {
        this.loadedImage = null;
        this.defineRoom = new DefineRoom();
        this.root = this.buildLayout();
        this.defineRoom.mount(document.body);
        this.registerEvents();
    }
    mount(container) {
        container.appendChild(this.root);
    }
    buildLayout() {
        const layout = (_jsxs("div", { class: "app", children: [_jsxs("header", { class: "hero", children: [_jsx("h1", { children: "Room Mask Demo" }), _jsx("p", { children: "Upload an image to experiment with 1-bit raster room masks." })] }), _jsxs("section", { class: "uploader", children: [_jsxs("div", { class: "drop-zone", ref: (node) => node && (this.dropZone = node), children: [_jsx("input", { class: "file-input", type: "file", accept: "image/*", ref: (node) => node && (this.fileInput = node) }), _jsx("p", { children: "Drag & drop an image here, or click to select." }), _jsx("button", { class: "choose-button", type: "button", children: "Browse" })] }), _jsxs("div", { class: "preview", children: [_jsx("h2", { children: "Preview" }), _jsx("img", { alt: "Uploaded preview", class: "preview-image", ref: (node) => node && (this.previewImage = node) }), _jsx("p", { class: "status", ref: (node) => node && (this.statusMessage = node), children: "No image selected." })] })] }), _jsx("section", { class: "actions", children: _jsx("button", { class: "define-button", type: "button", disabled: true, ref: (node) => node && (this.defineButton = node), children: "Define Room" }) })] }));
        return layout;
    }
    registerEvents() {
        this.dropZone.addEventListener("click", () => this.fileInput.click());
        this.dropZone.addEventListener("dragover", (event) => {
            event.preventDefault();
            this.dropZone.classList.add("dragging");
        });
        this.dropZone.addEventListener("dragleave", () => {
            this.dropZone.classList.remove("dragging");
        });
        this.dropZone.addEventListener("drop", (event) => {
            event.preventDefault();
            this.dropZone.classList.remove("dragging");
            if (event.dataTransfer && event.dataTransfer.files.length > 0) {
                this.handleFile(event.dataTransfer.files[0]);
            }
        });
        this.fileInput.addEventListener("change", () => {
            if (this.fileInput.files && this.fileInput.files.length > 0) {
                this.handleFile(this.fileInput.files[0]);
            }
        });
        this.defineButton.addEventListener("click", () => {
            if (this.loadedImage) {
                this.defineRoom.open(this.loadedImage);
            }
        });
    }
    handleFile(file) {
        if (!file.type.startsWith("image/")) {
            this.statusMessage.textContent = "Please choose a valid image file.";
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result === "string") {
                this.previewImage.src = result;
                this.statusMessage.textContent = `${file.name} (${Math.round(file.size / 1024)} kB)`;
                this.loadImage(result);
            }
        };
        reader.onerror = () => {
            this.statusMessage.textContent = "Unable to read the selected file.";
        };
        reader.readAsDataURL(file);
    }
    loadImage(source) {
        const image = new Image();
        image.onload = () => {
            this.loadedImage = image;
            this.defineButton.disabled = false;
        };
        image.onerror = () => {
            this.statusMessage.textContent = "The image could not be loaded.";
            this.defineButton.disabled = true;
            this.loadedImage = null;
        };
        image.src = source;
    }
}
