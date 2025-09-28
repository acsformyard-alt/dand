import { DefineRoom } from "./components/DefineRoom.js";

export class App {
  private root: HTMLElement;

  private dropZone!: HTMLElement;

  private fileInput!: HTMLInputElement;

  private previewImage!: HTMLImageElement;

  private defineButton!: HTMLButtonElement;

  private statusMessage!: HTMLElement;

  private defineRoom: DefineRoom;

  private loadedImage: HTMLImageElement | null = null;

  constructor() {
    this.defineRoom = new DefineRoom();
    this.root = this.buildLayout();
    this.defineRoom.mount(document.body);
    this.registerEvents();
  }

  public mount(container: HTMLElement): void {
    container.appendChild(this.root);
  }

  private buildLayout(): HTMLElement {
    const layout = (
      <div class="app">
        <header class="hero">
          <h1>Room Mask Demo</h1>
          <p>Upload an image to experiment with 1-bit raster room masks.</p>
        </header>
        <section class="uploader">
          <div class="drop-zone" ref={(node: HTMLElement | null) => node && (this.dropZone = node)}>
            <input
              class="file-input"
              type="file"
              accept="image/*"
              ref={(node: HTMLInputElement | null) => node && (this.fileInput = node)}
            />
            <p>Drag &amp; drop an image here, or click to select.</p>
            <button class="choose-button" type="button">Browse</button>
          </div>
          <div class="preview">
            <h2>Preview</h2>
            <img alt="Uploaded preview" class="preview-image" ref={(node: HTMLImageElement | null) => node && (this.previewImage = node)} />
            <p class="status" ref={(node: HTMLElement | null) => node && (this.statusMessage = node)}>No image selected.</p>
          </div>
        </section>
        <section class="actions">
          <button
            class="define-button"
            type="button"
            disabled
            ref={(node: HTMLButtonElement | null) => node && (this.defineButton = node)}
          >
            Define Room
          </button>
        </section>
      </div>
    ) as HTMLElement;

    return layout;
  }

  private registerEvents(): void {
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

  private handleFile(file: File): void {
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

  private loadImage(source: string): void {
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
