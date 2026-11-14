"use client";

import Image from "next/image";
import { useState } from "react";

import logo from "@/public/logo.png";

import { ClockIcon } from "./icons";

export interface LogoMarcaProps {
  /**
   * Clases de tamaño. Por defecto alto de 40px y ancho automático para
   * respetar la proporción real de la imagen.
   */
  className?: string;
}

/**
 * Logo de marca del portal.
 *
 * Para cambiarlo, reemplaza el archivo `public/logo.png` manteniendo el
 * nombre (PNG con fondo transparente). Next.js genera un hash del contenido,
 * así que el navegador nunca muestra una versión vieja, y sirve la imagen
 * optimizada en WebP/AVIF al tamaño en que se muestra.
 *
 * Si prefieres otro nombre de archivo, actualiza solo el import de arriba.
 * Si la imagen falla al cargar, se muestra el reloj original como respaldo.
 */
export function LogoMarca({
  className = "h-10 w-auto",
}: LogoMarcaProps = {}) {
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
      sizes="128px"
      priority
      onError={() => setFallo(true)}
      className={`${className} shrink-0 object-contain`}
    />
  );
}
