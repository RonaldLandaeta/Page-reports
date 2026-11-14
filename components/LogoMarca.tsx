"use client";

import Image from "next/image";
import { useState } from "react";

import logo from "@/public/logo.png";

import { ClockIcon } from "./icons";

/**
 * Logo de marca del portal.
 *
 * Para cambiarlo, reemplaza el archivo `public/logo.png` manteniendo el
 * nombre (PNG con fondo transparente, idealmente 96×96 o 192×192 px).
 * Next.js genera un hash del contenido, así que el navegador nunca muestra
 * una versión vieja, y sirve la imagen optimizada en WebP/AVIF.
 *
 * Si prefieres otro nombre de archivo, actualiza solo el import de arriba.
 * Si la imagen falla al cargar, se muestra el reloj original como respaldo.
 */
export function LogoMarca() {
  const [fallo, setFallo] = useState(false);

  if (fallo) {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
        <ClockIcon className="size-5" />
      </span>
    );
  }

  return (
    <Image
      src={logo}
      alt=""
      sizes="40px"
      priority
      onError={() => setFallo(true)}
      className="size-10 shrink-0 rounded-lg object-contain"
    />
  );
}
