# ♛ Échecs Spécial

Un jeu d'**échecs revisité**, jouable à deux dans le navigateur — **HTML / CSS / JavaScript pur**, sans aucune dépendance.
Projet réalisé dans le cadre du **TP3 « De l'idée à la mise en production »**.

> 🎮 **Jouer** : ouvre simplement `index.html` dans ton navigateur (rien à installer).
> 🌐 **En ligne** (après déploiement Coolify) : `https://<votre-domaine>.planbadge.fr`

## ✨ Fonctionnalités (V1)
- Échiquier complet jouable **à deux sur le même écran**
- Déplacements **légaux** de chaque pièce (pion, tour, cavalier, fou, dame, roi)
- **Captures**, surbrillance des coups possibles, **promotion** automatique des pions en dame
- Pièces capturées affichées de chaque côté
- 🏆 Victoire à la **capture du roi**
- 👑 **Twist spécial : Mode King of the Hill** — amène ton roi sur l'une des 4 cases centrales pour gagner instantanément (activable via la case à cocher)

## 🗂️ Structure
| Fichier | Rôle |
|---|---|
| `index.html` | Structure de la page + échiquier |
| `style.css` | Design (thème, échiquier, surbrillances) |
| `script.js` | Logique du jeu (déplacements, captures, règles) |

## 🔄 Workflow d'équipe (TP3)
1. **Cloner** le dépôt : `git clone <url>` (ou via VS Code → *Git: Clone*)
2. Coder sa partie — **chaque membre fait au moins un commit**
3. Sauvegarder : **Source Control → Commit → Sync Changes** (push sur GitHub)
4. **Avant de coder**, toujours récupérer le travail des autres : **Pull**
5. **Mise en production** via **Coolify** : New Resource → Git Repository → Build Pack **Static** → domaine `…planbadge.fr` → **Deploy**

## 🚧 Idées d'améliorations (à se répartir)
**Design** — thèmes de plateau, animations de déplacement, version mobile soignée, écran de victoire.
**Fonctionnalités** — détection d'échec et **échec et mat**, **roque**, prise en passant, **horloge** par joueur, choix de la pièce de promotion, **adversaire IA**, modes spéciaux (Atomic, power-ups, Chess960).
**Contenu** — règles détaillées, historique des coups (notation), page « À propos », son.

## 👥 Membres
- Axel
- Clément C.
- *(ajoutez vos noms)*

---
*Première version générée avec l'aide de l'IA, à enrichir en équipe — c'est tout l'esprit du TP.*
