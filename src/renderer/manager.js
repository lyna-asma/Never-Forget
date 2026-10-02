const list =
  document.getElementById(
    "widget-list"
  );

const addTaskButton =
  document.getElementById(
    "add-task"
  );

const addImageButton =
  document.getElementById(
    "add-image"
  );


// --------------------------------------------------
// Create buttons
// --------------------------------------------------

addTaskButton.addEventListener(
  "click",
  () => {
    window.widgetAPI.createWidget(
      "task"
    );
  }
);

addImageButton.addEventListener(
  "click",
  () => {
    window.widgetAPI.createWidget(
      "image"
    );
  }
);


// --------------------------------------------------
// Receive widget list
// --------------------------------------------------

window.widgetAPI.onManagerData(
  (widgets) => {
    renderWidgets(
      widgets
    );
  }
);


// --------------------------------------------------
// Render manager
// --------------------------------------------------

function renderWidgets(
  widgets
) {
  list.innerHTML = "";

  if (
    widgets.length === 0
  ) {
    const empty =
      document.createElement(
        "p"
      );

    empty.className =
      "empty";

    empty.textContent =
      "No widgets.";

    list.appendChild(
      empty
    );

    return;
  }

  for (
    const widget of widgets
  ) {
    const card =
      document.createElement(
        "article"
      );

    card.className =
      "widget-card";


    const information =
      document.createElement(
        "div"
      );

    information.className =
      "widget-information";


    const title =
      document.createElement(
        "h2"
      );

    title.textContent =
      widget.title;


    const type =
      document.createElement(
        "span"
      );

    type.className =
      "widget-type";

    type.textContent =
      widget.type;


    information.appendChild(
      title
    );

    information.appendChild(
      type
    );


    if (
      widget.alwaysOnTop
    ) {
      const badge =
        document.createElement(
          "span"
        );

      badge.className =
        "widget-badge";

      badge.textContent =
        "Always on top";

      information.appendChild(
        badge
      );
    }


    const actions =
      document.createElement(
        "div"
      );

    actions.className =
      "widget-actions";


    const focusButton =
      document.createElement(
        "button"
      );

    focusButton.textContent =
      "Show";

    focusButton.addEventListener(
      "click",
      () => {
        window.widgetAPI.focusWidget(
          widget.id
        );
      }
    );


    const deleteButton =
      document.createElement(
        "button"
      );

    deleteButton.textContent =
      "Delete";

    deleteButton.className =
      "danger";

    deleteButton.addEventListener(
      "click",
      () => {
        window.widgetAPI.deleteWidget(
          widget.id
        );
      }
    );


    actions.appendChild(
      focusButton
    );

    actions.appendChild(
      deleteButton
    );


    card.appendChild(
      information
    );

    card.appendChild(
      actions
    );

    list.appendChild(
      card
    );
  }
}