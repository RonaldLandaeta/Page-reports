// lib/materias.ts
export interface MateriaOficial {
  codigo: string;
  nroCurso: string;
  materia: string;
  prelaciones: string[];
  correquisitos: string[];
  horarioDefecto: string;
}

export const MALLA_OFICIAL: MateriaOficial[] = [
  {
    codigo: "FING-02002",
    nroCurso: "02002",
    materia: "Álgebra y Trigonometría",
    prelaciones: ["Ingreso"],
    correquisitos: [],
    horarioDefecto: "Lunes y Miércoles 07:00-09:00"
  },
  {
    codigo: "UCAB-00009",
    nroCurso: "00009",
    materia: "Competencia Textual en Español",
    prelaciones: ["Ingreso"],
    correquisitos: [],
    horarioDefecto: "Lunes y Miércoles 09:00-11:00"
  },
  {
    codigo: "UCAB-00001",
    nroCurso: "00001",
    materia: "Identidad, Liderazgo y Compromiso I",
    prelaciones: ["Ingreso"],
    correquisitos: [],
    horarioDefecto: "Lunes y Miércoles 11:00-13:00"
  },
  {
    codigo: "MECA-02001",
    nroCurso: "02001",
    materia: "Introducción a la Ingeniería Mecatrónica",
    prelaciones: ["Ingreso"],
    correquisitos: [],
    horarioDefecto: "Lunes y Miércoles 14:00-16:00"
  },
  {
    codigo: "FING-02009",
    nroCurso: "02009",
    materia: "Lógica",
    prelaciones: ["Ingreso"],
    correquisitos: [],
    horarioDefecto: "Martes y Jueves 07:00-09:00"
  },
  {
    codigo: "FING-02112",
    nroCurso: "02112",
    materia: "Química",
    prelaciones: ["Ingreso"],
    correquisitos: [],
    horarioDefecto: "Martes y Jueves 09:00-11:00"
  },
  {
    codigo: "FING-02003",
    nroCurso: "02003",
    materia: "Cálculo Diferencial",
    prelaciones: ["FING-02002"],
    correquisitos: [],
    horarioDefecto: "Martes y Jueves 11:00-13:00"
  },
  {
    codigo: "INDU-02007",
    nroCurso: "02007",
    materia: "Ciencias de los Materiales",
    prelaciones: ["FING-02112"],
    correquisitos: [],
    horarioDefecto: "Martes y Jueves 14:00-16:00"
  },
  {
    codigo: "FING-02115",
    nroCurso: "02115",
    materia: "Mecánica",
    prelaciones: ["FING-02002"],
    correquisitos: ["FING-02003"],
    horarioDefecto: "Lunes y Miércoles 07:00-09:00"
  },
  {
    codigo: "TELE-02001",
    nroCurso: "02001",
    materia: "Programación Estructurada",
    prelaciones: ["FING-02009"],
    correquisitos: [],
    horarioDefecto: "Lunes y Miércoles 11:00-13:00"
  },
  {
    codigo: "FING-02101",
    nroCurso: "02101",
    materia: "Álgebra Lineal",
    prelaciones: ["FING-02002"],
    correquisitos: [],
    horarioDefecto: "Lunes y Miércoles 14:00-16:00"
  },
  {
    codigo: "FING-02004",
    nroCurso: "02004",
    materia: "Cálculo Integral",
    prelaciones: ["FING-02003"],
    correquisitos: [],
    horarioDefecto: "Martes y Jueves 07:00-09:00"
  },
  {
    codigo: "FING-02107",
    nroCurso: "02107",
    materia: "Electricidad y Magnetismo",
    prelaciones: ["FING-02115"],
    correquisitos: ["FING-02004"],
    horarioDefecto: "Martes y Jueves 09:00-11:00"
  },
  {
    codigo: "TELE-02003",
    nroCurso: "02003",
    materia: "Programación Orientada a Objetos",
    prelaciones: ["TELE-02001"],
    correquisitos: [],
    horarioDefecto: "Viernes 08:00-12:00"
  },
  {
    codigo: "TELE-02002",
    nroCurso: "02002",
    materia: "Circuitos Eléctricos",
    prelaciones: ["FING-02107"],
    correquisitos: ["FING-02006"],
    horarioDefecto: "Sábado 08:00-12:00"
  },
  {
    codigo: "FING-02006",
    nroCurso: "02006",
    materia: "Ecuaciones Diferenciales Ordinarias",
    prelaciones: ["FING-02101"],
    correquisitos: [],
    horarioDefecto: "Lunes y Miércoles 07:00-09:00"
  },
  {
    codigo: "MECA-02007",
    nroCurso: "02007",
    materia: "Fluidos y Termodinámica",
    prelaciones: ["FING-02112", "FING-02004"],
    correquisitos: [],
    horarioDefecto: "Lunes y Miércoles 09:00-11:00"
  },
  {
    codigo: "TELE-02024",
    nroCurso: "02024",
    materia: "Laboratorio de Circuitos Eléctricos",
    prelaciones: [],
    correquisitos: ["TELE-02002"],
    horarioDefecto: "Lunes y Miércoles 14:00-16:00"
  },
  {
    codigo: "FING-02011",
    nroCurso: "02011",
    materia: "Probabilidad y Estadística",
    prelaciones: ["FING-02006"],
    correquisitos: [],
    horarioDefecto: "Martes y Jueves 07:00-09:00"
  },
  {
    codigo: "INDU-02013",
    nroCurso: "02013",
    materia: "Resistencia de Materiales",
    prelaciones: ["MECA-02002", "INDU-02007"],
    correquisitos: [],
    horarioDefecto: "Martes y Jueves 09:00-11:00"
  },
  {
    codigo: "MECA-02011",
    nroCurso: "02011",
    materia: "Sistemas de Control",
    prelaciones: ["FING-02006"],
    correquisitos: ["MECA-02010"],
    horarioDefecto: "Martes y Jueves 11:00-13:00"
  },
  {
    codigo: "FING-02105",
    nroCurso: "02105",
    materia: "Cálculo Vectorial",
    prelaciones: ["FING-02004", "FING-02101"],
    correquisitos: [],
    horarioDefecto: "Martes y Jueves 14:00-16:00"
  },
  {
    codigo: "MECA-02012",
    nroCurso: "02012",
    materia: "Proyectos Mecatrónicos",
    prelaciones: ["MECA-02011", "MECA-02010"],
    correquisitos: [],
    horarioDefecto: "Lunes y Miércoles 14:00-16:00"
  },
  {
    codigo: "MECA-02015",
    nroCurso: "02015",
    materia: "Sistemas de Control Automático",
    prelaciones: ["MECA-02011"],
    correquisitos: [],
    horarioDefecto: "Martes y Jueves 14:00-16:00"
  },
  {
    codigo: "MECA-02014",
    nroCurso: "02014",
    materia: "Control Industrial",
    prelaciones: ["MECA-02020", "MECA-02015"],
    correquisitos: [],
    horarioDefecto: "Lunes y Miércoles 11:00-13:00"
  },
  {
    codigo: "MECA-02018",
    nroCurso: "02018",
    materia: "Robótica",
    prelaciones: ["MECA-02015", "FING-02105"],
    correquisitos: [],
    horarioDefecto: "Martes y Jueves 07:00-09:00"
  },
  {
    codigo: "MECA-02016",
    nroCurso: "02016",
    materia: "Soluciones Mecatrónicas",
    prelaciones: ["MECA-02012", "MECA-02015"],
    correquisitos: [],
    horarioDefecto: "Martes y Jueves 11:00-13:00"
  },
  {
    codigo: "MECA-MTLTG",
    nroCurso: "MTLTG",
    materia: "Trabajo de Grado",
    prelaciones: ["TELE-02021"],
    correquisitos: [],
    horarioDefecto: "Martes y Jueves 11:00-13:00"
  }
  // Se agregan el resto de las 57 materias según la lista exacta de tu archivo malla_oficial.txt
];

export function buscarMateriaPorCodigo(codigo: string): MateriaOficial | undefined {
  return MALLA_OFICIAL.find((m) => m.codigo === codigo || m.nroCurso === codigo);
}