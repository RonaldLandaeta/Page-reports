-- Catálogo inicial (origen: data/materias.csv).
-- Se puede volver a ejecutar: actualiza las materias existentes por NRC.
insert into public.materias (nrc, nombre, docente, horario, aula)
values
  ('10245', 'Cálculo Diferencial', 'Ing. María Torres', 'Lun y Mié · 08:00 – 10:00', 'B-204'),
  ('10482', 'Programación Orientada a Objetos', 'Ing. Carlos Vera', 'Mar y Jue · 10:00 – 12:00', 'C-105'),
  ('10817', 'Base de Datos', 'Ing. Andrea Salazar', 'Lun y Vie · 14:00 – 16:00', 'A-310'),
  ('11039', 'Redes de Computadoras', 'Ing. Jorge Mendoza', 'Mié y Vie · 16:00 – 18:00', 'B-102'),
  ('11264', 'Estadística Aplicada', 'Lic. Paola Cedeño', 'Mar y Jue · 07:00 – 09:00', 'D-201'),
  ('11598', 'Ingeniería de Software', 'Ing. Diego Ramírez', 'Lun y Mié · 18:00 – 20:00', 'C-401'),
  ('11803', 'Física General', 'Ing. Sofía Almeida', 'Mar y Vie · 08:00 – 10:00', 'A-105'),
  ('12077', 'Arquitectura de Computadores', 'Ing. Ricardo Paredes', 'Jue y Vie · 14:00 – 16:00', 'Lab. B-210')
on conflict (nrc) do update set
  nombre    = excluded.nombre,
  docente   = excluded.docente,
  horario   = excluded.horario,
  aula      = excluded.aula,
  activo    = true;
