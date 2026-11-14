import Image from "next/image";

import logoClaro from "@/public/logo-modo-claro.png";
import logoOscuro from "@/public/logo-modo-oscuro.png";

export interface LogoMarcaProps {
  /**
   * Clases de tamaño. Por defecto alto de 40px y ancho automático para
   * respetar la proporción real de la imagen.
   */
  className?: string;
}

/**
 * Logo de marca con una variante por tema:
 *
 * - `public/logo-modo-claro.png` → se ve cuando el fondo es blanco.
 * - `public/logo-modo-oscuro.png` → se ve cuando el fondo es negro.
 *
 * Para cambiarlos, reemplaza esos archivos manteniendo el nombre. Next.js
 * genera un hash del contenido, así que nunca se muestra una versión vieja,
 * y sirve cada imagen optimizada en WebP/AVIF al tamaño en que se muestra.
 *
 * Ambas variantes se renderizan y el CSS decide cuál mostrar según la clase
 * `.dark`, así que no hay parpadeo al cambiar de tema.
 */
export function LogoMarca({
  className = "h-8 w-auto sm:h-10",
}: LogoMarcaProps = {}) {
  return (
    <>
      <Image
        src={logoClaro}
        alt=""
        sizes="128px"
        priority
        className={`${className} block shrink-0 object-contain dark:hidden`}
      />
      <Image
        src={logoOscuro}
        alt=""
        sizes="128px"
        priority
        className={`${className} hidden shrink-0 object-contain dark:block`}
      />
    </>
  );
}
