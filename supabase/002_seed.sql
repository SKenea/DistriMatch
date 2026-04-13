-- ============================================
-- DistriMatch - Seed Data (25 distributeurs + produits)
-- A coller dans SQL Editor > New query > Run
-- ============================================

INSERT INTO distributors (id, name, type, emoji, address, city, lat, lng, rating, review_count, status, last_verified, price_range) VALUES
('dist-001', 'Pizza Express Biarritz', 'pizza', '🍕', '12 Avenue de la Grande Plage, 64200 Biarritz', 'Biarritz', 43.4832, -1.5586, 4.5, 127, 'verified', '2025-12-05', '€€'),
('dist-002', 'Le Taloa du Fronton', 'bakery', '🥖', 'Place du Fronton, 64250 Espelette', 'Espelette', 43.3411, -1.4486, 4.8, 89, 'verified', '2025-12-04', '€'),
('dist-003', 'Frites Fraîches Anglet', 'fries', '🍟', 'Centre Commercial BAB2, 64600 Anglet', 'Anglet', 43.4784, -1.5147, 4.2, 56, 'verified', '2025-12-03', '€'),
('dist-004', 'Fromages de Brebis Urrugne', 'cheese', '🧀', 'Route de Saint-Jean-de-Luz, 64122 Urrugne', 'Urrugne', 43.3628, -1.6997, 4.9, 203, 'verified', '2025-12-05', '€€€'),
('dist-005', 'Plats Cuisinés Bayonne', 'meals', '🍽️', '15 Rue Port-Neuf, 64100 Bayonne', 'Bayonne', 43.4929, -1.4748, 4.3, 78, 'verified', '2025-12-02', '€€'),
('dist-006', 'Lait Frais Hasparren', 'dairy', '🥛', 'Chemin de la Ferme, 64240 Hasparren', 'Hasparren', 43.3842, -1.3056, 4.6, 42, 'verified', '2025-12-06', '€'),
('dist-007', 'Légumes Bio Cambo', 'agricultural', '🥕', 'Route des Thermes, 64250 Cambo-les-Bains', 'Cambo-les-Bains', 43.3592, -1.4003, 4.7, 91, 'verified', '2025-12-05', '€€'),
('dist-008', 'Charcuterie Aldudes', 'meat', '🥩', 'Place de l''Église, 64430 Les Aldudes', 'Les Aldudes', 43.0972, -1.4306, 4.8, 156, 'verified', '2025-12-04', '€€€'),
('dist-009', 'Miel & Terroir Ainhoa', 'terroir', '🍯', 'Rue Principale, 64250 Ainhoa', 'Ainhoa', 43.3047, -1.4722, 4.9, 67, 'verified', '2025-12-03', '€€'),
('dist-010', 'Distributeur Mixte St-Jean', 'general', '🏪', 'Boulevard Thiers, 64500 Saint-Jean-de-Luz', 'Saint-Jean-de-Luz', 43.3883, -1.6603, 4.1, 234, 'verified', '2025-12-06', '€€'),
('dist-011', 'Pizza Guéthary Plage', 'pizza', '🍕', 'Avenue du Général de Gaulle, 64210 Guéthary', 'Guéthary', 43.4242, -1.6097, 4.4, 98, 'verified', '2025-12-04', '€€'),
('dist-012', 'Boulangerie Auto Bidart', 'bakery', '🥖', 'Avenue de la Plage, 64210 Bidart', 'Bidart', 43.4375, -1.5917, 4.6, 145, 'warning', '2025-11-28', '€'),
('dist-013', 'Cidre Fermier Irouléguy', 'terroir', '🍯', 'Chemin des Vignes, 64220 Irouléguy', 'Irouléguy', 43.1633, -1.2333, 4.7, 54, 'verified', '2025-12-02', '€€'),
('dist-014', 'Oeufs Frais Ustaritz', 'agricultural', '🥕', 'Route de Bayonne, 64480 Ustaritz', 'Ustaritz', 43.3969, -1.4556, 4.5, 73, 'verified', '2025-12-05', '€'),
('dist-015', 'Poissonnerie Express Socoa', 'meat', '🐟', 'Port de Socoa, 64122 Ciboure', 'Ciboure', 43.3897, -1.6803, 4.8, 112, 'verified', '2025-12-06', '€€€'),
('dist-016', 'Snack Bayonne Centre', 'general', '🏪', 'Rue d''Espagne, 64100 Bayonne', 'Bayonne', 43.4889, -1.4756, 3.9, 189, 'warning', '2025-11-25', '€'),
('dist-017', 'Fromagerie Larressore', 'cheese', '🧀', 'Place du Village, 64480 Larressore', 'Larressore', 43.3694, -1.4389, 4.6, 48, 'verified', '2025-12-03', '€€'),
('dist-018', 'Pizza Nocturne Anglet', 'pizza', '🍕', 'Boulevard de la Mer, 64600 Anglet', 'Anglet', 43.5025, -1.5253, 4.0, 167, 'verified', '2025-12-01', '€€'),
('dist-019', 'Légumes Sare', 'agricultural', '🥕', 'Route du Col de Lizarrieta, 64310 Sare', 'Sare', 43.3131, -1.5800, 4.9, 36, 'verified', '2025-12-05', '€€'),
('dist-020', 'Plats Maison Hendaye', 'meals', '🍽️', 'Boulevard de la Plage, 64700 Hendaye', 'Hendaye', 43.3617, -1.7739, 4.4, 82, 'verified', '2025-12-04', '€€'),
('dist-021', 'Boulangerie 24h Mouguerre', 'bakery', '🥖', 'Zone Industrielle, 64990 Mouguerre', 'Mouguerre', 43.4728, -1.4378, 4.2, 95, 'verified', '2025-12-06', '€'),
('dist-022', 'Viande Basque Mendionde', 'meat', '🥩', 'Route de Louhossoa, 64240 Mendionde', 'Mendionde', 43.3369, -1.2947, 4.7, 61, 'verified', '2025-12-02', '€€€'),
('dist-023', 'Yaourts Ferme Itxassou', 'dairy', '🥛', 'Quartier Église, 64250 Itxassou', 'Itxassou', 43.3297, -1.4056, 4.8, 77, 'verified', '2025-12-05', '€'),
('dist-024', 'Frites Gare Bayonne', 'fries', '🍟', 'Place de la Gare, 64100 Bayonne', 'Bayonne', 43.4958, -1.4722, 3.8, 203, 'warning', '2025-11-20', '€'),
('dist-025', 'Confitures Ascain', 'terroir', '🍯', 'Rue du Bourg, 64310 Ascain', 'Ascain', 43.3450, -1.6214, 4.6, 52, 'verified', '2025-12-03', '€€');

-- Produits
INSERT INTO products (distributor_id, name, price, available) VALUES
-- dist-001 Pizza Express Biarritz
('dist-001', 'Pizza Margherita', 8.50, true),
('dist-001', 'Pizza 4 Fromages', 10.00, true),
('dist-001', 'Pizza Basque (piment)', 11.00, true),
('dist-001', 'Pizza Végétarienne', 9.50, false),
-- dist-002 Le Taloa du Fronton
('dist-002', 'Taloa nature', 2.50, true),
('dist-002', 'Taloa jambon-fromage', 4.50, true),
('dist-002', 'Taloa chorizo', 4.00, true),
('dist-002', 'Gâteau Basque', 3.50, true),
-- dist-003 Frites Fraîches Anglet
('dist-003', 'Cornet de frites', 3.50, true),
('dist-003', 'Grande barquette', 5.00, true),
('dist-003', 'Frites sauce fromage', 5.50, true),
('dist-003', 'Frites piment d''Espelette', 4.50, true),
-- dist-004 Fromages de Brebis Urrugne
('dist-004', 'Ossau-Iraty AOP (250g)', 8.00, true),
('dist-004', 'Tome de brebis (500g)', 12.00, true),
('dist-004', 'Fromage frais', 4.50, true),
('dist-004', 'Crottin de brebis', 3.00, false),
-- dist-005 Plats Cuisinés Bayonne
('dist-005', 'Axoa de veau', 9.50, true),
('dist-005', 'Poulet basquaise', 8.50, true),
('dist-005', 'Piperade aux oeufs', 7.00, true),
('dist-005', 'Chipirons à l''encre', 11.00, false),
-- dist-006 Lait Frais Hasparren
('dist-006', 'Lait frais entier (1L)', 1.80, true),
('dist-006', 'Yaourt nature (x4)', 3.20, true),
('dist-006', 'Fromage blanc', 2.50, true),
('dist-006', 'Beurre fermier (250g)', 4.00, true),
-- dist-007 Légumes Bio Cambo
('dist-007', 'Panier légumes saison', 12.00, true),
('dist-007', 'Pommes de terre (2kg)', 4.50, true),
('dist-007', 'Carottes (1kg)', 3.00, true),
('dist-007', 'Salades (lot de 2)', 3.50, true),
-- dist-008 Charcuterie Aldudes
('dist-008', 'Jambon de Bayonne (200g)', 9.00, true),
('dist-008', 'Saucisson sec', 7.50, true),
('dist-008', 'Ventrèche', 6.00, true),
('dist-008', 'Pâté basque', 5.00, true),
-- dist-009 Miel & Terroir Ainhoa
('dist-009', 'Miel de montagne (500g)', 12.00, true),
('dist-009', 'Confiture de cerises', 5.50, true),
('dist-009', 'Piment d''Espelette AOP', 8.00, true),
('dist-009', 'Gelée de coing', 4.50, true),
-- dist-010 Distributeur Mixte St-Jean
('dist-010', 'Sandwich jambon-beurre', 4.50, true),
('dist-010', 'Salade composée', 6.00, true),
('dist-010', 'Boisson fraîche', 2.00, true),
('dist-010', 'Fruit frais', 1.50, true),
-- dist-011 Pizza Guéthary Plage
('dist-011', 'Pizza Royale', 11.00, true),
('dist-011', 'Pizza Surfeur', 12.00, true),
('dist-011', 'Pizza Calzone', 10.50, false),
('dist-011', 'Pizza Jambon', 9.00, true),
-- dist-012 Boulangerie Auto Bidart
('dist-012', 'Baguette tradition', 1.40, true),
('dist-012', 'Croissant pur beurre', 1.30, true),
('dist-012', 'Pain au chocolat', 1.40, true),
('dist-012', 'Brioche', 2.50, false),
-- dist-013 Cidre Fermier Irouléguy
('dist-013', 'Cidre basque (75cl)', 6.50, true),
('dist-013', 'Vin Irouléguy rouge', 12.00, true),
('dist-013', 'Vin Irouléguy blanc', 11.00, true),
('dist-013', 'Patxaran', 15.00, true),
-- dist-014 Oeufs Frais Ustaritz
('dist-014', 'Oeufs fermiers (x6)', 3.00, true),
('dist-014', 'Oeufs fermiers (x12)', 5.50, true),
('dist-014', 'Oeufs bio (x6)', 4.00, true),
('dist-014', 'Poule pondeuse', 15.00, false),
-- dist-015 Poissonnerie Express Socoa
('dist-015', 'Thon rouge (200g)', 14.00, true),
('dist-015', 'Chipirons frais (300g)', 9.00, true),
('dist-015', 'Merlu (pièce)', 8.00, true),
('dist-015', 'Crevettes (200g)', 7.00, true),
-- dist-016 Snack Bayonne Centre
('dist-016', 'Sandwich baguette', 4.00, true),
('dist-016', 'Chips', 1.50, true),
('dist-016', 'Canette soda', 1.80, true),
('dist-016', 'Chocolat', 1.20, true),
-- dist-017 Fromagerie Larressore
('dist-017', 'Tomme fermière', 10.00, true),
('dist-017', 'Fromage affiné 6 mois', 14.00, true),
('dist-017', 'Fromage piment', 12.00, true),
('dist-017', 'Caillé de brebis', 5.00, true),
-- dist-018 Pizza Nocturne Anglet
('dist-018', 'Pizza Classique', 8.00, true),
('dist-018', 'Pizza Spéciale', 10.50, true),
('dist-018', 'Pizza du Chef', 12.00, true),
('dist-018', 'Pizza XXL', 15.00, false),
-- dist-019 Légumes Sare
('dist-019', 'Potimarron', 4.00, true),
('dist-019', 'Courge butternut', 3.50, true),
('dist-019', 'Betteraves', 2.50, true),
('dist-019', 'Haricots verts', 5.00, false),
-- dist-020 Plats Maison Hendaye
('dist-020', 'Marmitako', 10.00, true),
('dist-020', 'Ttoro (soupe de poisson)', 12.00, true),
('dist-020', 'Merlu koskera', 11.00, true),
('dist-020', 'Pintxos variés (x6)', 8.00, true),
-- dist-021 Boulangerie 24h Mouguerre
('dist-021', 'Pain de campagne', 2.80, true),
('dist-021', 'Baguette', 1.20, true),
('dist-021', 'Viennoiseries (lot 4)', 4.50, true),
('dist-021', 'Tourte aux pommes', 12.00, true),
-- dist-022 Viande Basque Mendionde
('dist-022', 'Côtes d''agneau (4 pcs)', 16.00, true),
('dist-022', 'Saucisses fraîches', 8.00, true),
('dist-022', 'Rôti de porc', 12.00, true),
('dist-022', 'Boudin basque', 7.00, true),
-- dist-023 Yaourts Ferme Itxassou
('dist-023', 'Yaourt nature (x4)', 3.50, true),
('dist-023', 'Yaourt cerise noire', 4.00, true),
('dist-023', 'Fromage blanc (500g)', 3.80, true),
('dist-023', 'Faisselle', 3.00, true),
-- dist-024 Frites Gare Bayonne
('dist-024', 'Frites classiques', 3.00, true),
('dist-024', 'Frites XL', 4.50, true),
('dist-024', 'Nuggets (x6)', 4.00, false),
('dist-024', 'Sauce au choix', 0.50, true),
-- dist-025 Confitures Ascain
('dist-025', 'Confiture cerise noire', 6.50, true),
('dist-025', 'Confiture figue', 5.50, true),
('dist-025', 'Gelée de piment', 5.00, true),
('dist-025', 'Miel de châtaignier', 10.00, true);
